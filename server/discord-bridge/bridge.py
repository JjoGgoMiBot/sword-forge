"""Optional Discord adapter. Configuration arrives through stdin; never log secrets.

Runs alongside the existing bot and registers only its own four commands.
No changes to the bot's SQLite economy, guild settings or existing commands.
"""
import asyncio
import hashlib
import json
import logging
import sqlite3
import sys
import time
import uuid
from pathlib import Path

import aiohttp
import discord
from dotenv import dotenv_values

log = logging.getLogger('jj-land')
LAND_URL = 'https://seungjaehh.github.io/sword-forge/land/'
COMMANDS = [
    {'name': '랜드', 'description': '쪼꼬미랜드 마을 열기', 'type': 1, 'contexts': [0]},
    {'name': '랜드연결', 'description': '웹의 주민을 내 Discord 계정과 연결', 'type': 1, 'contexts': [0], 'options': [
        {'name': '코드', 'description': '마을 프로필에서 받은 10자리 연결 코드', 'type': 3, 'required': True, 'min_length': 10, 'max_length': 10}]},
    {'name': '랜드방연결', 'description': '일반채널 또는 음성방 채팅을 쪼꼬미랜드와 연결 (서버 관리)', 'type': 1, 'contexts': [0], 'default_member_permissions': '32', 'options': [
        {'name': '채널', 'description': '연결할 일반/음성채널 (생략하면 현재 음성방)', 'type': 7, 'channel_types': [0, 2], 'required': False}]},
    {'name': '랜드방해제', 'description': '일반채널 또는 음성방의 마을 채팅 연결 해제 (서버 관리)', 'type': 1, 'contexts': [0], 'default_member_permissions': '32', 'options': [
        {'name': '채널', 'description': '해제할 일반/음성채널 (생략하면 현재 음성방)', 'type': 7, 'channel_types': [0, 2], 'required': False}]},
]


class Bridge(discord.Client):
    def __init__(self, config):
        intents = discord.Intents.none()
        intents.guilds = True
        intents.guild_messages = True
        intents.message_content = True
        intents.voice_states = True
        super().__init__(intents=intents, allowed_mentions=discord.AllowedMentions.none())
        self.config = config
        self.api = config['api'].rstrip('/')
        self.secret = config['secret']
        self.bot_token = dotenv_values(config['dotenv']).get('DISCORD_TOKEN', '').strip()
        if not self.bot_token:
            raise RuntimeError('Existing bot token is not configured.')
        state = Path(config['state'])
        state.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(state)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('CREATE TABLE IF NOT EXISTS sent (room TEXT,id INTEGER,discord_id TEXT,attempted REAL,status TEXT,PRIMARY KEY(room,id))')
        self.db.execute('CREATE TABLE IF NOT EXISTS inbound (id TEXT PRIMARY KEY,room TEXT,data TEXT,created REAL)')
        self.db.commit()
        self.connections = {}
        self.tasks = {}
        self.channels = {}
        self.session = None
        self.refresh_task = None
        self.registered = False

    async def setup_hook(self):
        self.session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=20))

    async def land(self, route, body):
        async with self.session.post(self.api + '/land/bridge/' + route, json=body, headers={'Authorization': self.secret}) as response:
            data = await response.json()
            if response.status != 200:
                raise RuntimeError(data.get('msg', 'Land bridge request failed.'))
            return data

    async def discord_api(self, method, route, payload=None):
        for attempt in range(4):
            async with self.session.request(method, 'https://discord.com/api/v10' + route, json=payload,
                                            headers={'Authorization': 'Bot ' + self.bot_token}) as response:
                data = await response.json()
                if response.status == 429:
                    await asyncio.sleep(min(60, float(data.get('retry_after', 2))))
                    continue
                if response.status >= 400:
                    error = RuntimeError('Discord API rejected request: ' + str(response.status))
                    error.status = response.status
                    raise error
                return data
        raise RuntimeError('Discord API rate limit; retry later.')

    async def ensure_commands(self):
        existing = await self.discord_api('GET', f'/applications/{self.application_id}/commands')
        names = {c['name']: c for c in existing}
        def matches(actual, expected):
            if isinstance(expected, dict):
                return isinstance(actual, dict) and all(matches(actual.get(k), v) for k, v in expected.items())
            if isinstance(expected, list):
                return isinstance(actual, list) and len(actual) == len(expected) and all(matches(a, b) for a, b in zip(actual, expected))
            return actual == expected
        for command in COMMANDS:
            if not matches(names.get(command['name']), command):
                await self.discord_api('POST', f'/applications/{self.application_id}/commands', command)
        self.registered = True

    async def on_ready(self):
        log.info('Discord adapter connected; existing bot remains untouched.')
        if not self.refresh_task or self.refresh_task.done():
            self.refresh_task = asyncio.create_task(self.refresh_loop())

    async def refresh_loop(self):
        while not self.is_closed():
            try:
                await self.ensure_commands()
                data = await self.land('channels', {})
                channels = {str(c['channel_id']): c for c in data['channels']}
                rooms = {c['room'] for c in channels.values()}
                for key, task in list(self.tasks.items()):
                    if key not in rooms:
                        task.cancel()
                        self.tasks.pop(key, None)
                self.channels = channels
                for channel in channels.values():
                    key = channel['room']
                    if key not in self.tasks or self.tasks[key].done():
                        self.tasks[key] = asyncio.create_task(self.room_loop(channel))
            except Exception as error:
                log.warning('Adapter refresh: %s', type(error).__name__)
            await asyncio.sleep(60)

    async def room_loop(self, channel):
        key, channel_id = channel['room'], channel['channel_id']
        while not self.is_closed():
            try:
                url = self.api.replace('https://', 'wss://').replace('http://', 'ws://') + '/land/bridge/ws?room=' + key
                async with self.session.ws_connect(url, headers={'Authorization': self.secret}, heartbeat=25,
                                                   timeout=aiohttp.ClientWSTimeout(ws_close=10)) as ws:
                    self.connections[key] = ws
                    log.info('Chat relay connected.')
                    for event_id, data in self.db.execute('SELECT id,data FROM inbound WHERE room=? ORDER BY created', (key,)):
                        await ws.send_str(data)
                    async for message in ws:
                        if message.type != aiohttp.WSMsgType.TEXT:
                            continue
                        data = json.loads(message.data)
                        if data.get('type') == 'outbox':
                            for outgoing in data.get('messages', []):
                                await self.deliver(ws, key, channel_id, outgoing)
                            if len(data.get('messages', [])) >= 100:
                                await ws.send_json({'type': 'pullOutbox'})
                        elif data.get('type') == 'bridgeAck':
                            self.db.execute('DELETE FROM inbound WHERE id=?', (data['eventId'],))
                            self.db.commit()
            except asyncio.CancelledError:
                return
            except Exception as error:
                log.warning('Chat relay reconnecting: %s', type(error).__name__)
            finally:
                self.connections.pop(key, None)
            await asyncio.sleep(8)

    async def deliver(self, ws, key, channel_id, message):
        message_id = int(message['id'])
        known = self.db.execute('SELECT discord_id,attempted,status FROM sent WHERE room=? AND id=?', (key, message_id)).fetchone()
        if known and known[0]:
            await ws.send_json({'type': 'delivered', 'id': message_id, 'discordId': known[0]})
            return
        nonce = str(int.from_bytes(hashlib.sha256(f'{key}:{message_id}'.encode()).digest()[:8], 'big'))
        if known and known[2] == 'pending' and time.time() - known[1] > 120:
            recent = await self.discord_api('GET', f'/channels/{channel_id}/messages?limit=100')
            found = next((m for m in recent if str(m.get('nonce', '')) == nonce and m['author']['id'] == str(self.user.id)), None)
            if found:
                self.db.execute('UPDATE sent SET discord_id=?,status=? WHERE room=? AND id=?', (found['id'], 'sent', key, message_id))
                self.db.commit()
                await ws.send_json({'type': 'delivered', 'id': message_id, 'discordId': found['id']})
            else:
                await ws.send_json({'type': 'deliveryError', 'id': message_id})
            return
        self.db.execute('INSERT INTO sent VALUES(?,?,NULL,?,?) ON CONFLICT(room,id) DO UPDATE SET attempted=excluded.attempted,status=excluded.status',
                        (key, message_id, time.time(), 'pending'))
        self.db.commit()
        content = f"[마을 · {message['name']}] {message['text']}"
        try:
            sent = await self.discord_api('POST', f'/channels/{channel_id}/messages',
                                           {'content': content[:1900], 'allowed_mentions': {'parse': []}, 'nonce': nonce, 'enforce_nonce': True})
        except Exception as error:
            if getattr(error, 'status', 0) in (400, 401, 403, 404):
                self.db.execute('UPDATE sent SET status=? WHERE room=? AND id=?', ('rejected', key, message_id))
                self.db.commit()
            raise
        self.db.execute('UPDATE sent SET discord_id=?,status=? WHERE room=? AND id=?', (sent['id'], 'sent', key, message_id))
        self.db.commit()
        await ws.send_json({'type': 'delivered', 'id': message_id, 'discordId': sent['id']})

    async def queue(self, channel_id, event):
        channel = self.channels.get(str(channel_id))
        if not channel:
            return
        key = channel['room']
        event['eventId'] = str(uuid.uuid4())
        raw = json.dumps(event, ensure_ascii=False, separators=(',', ':'))
        self.db.execute('INSERT INTO inbound VALUES(?,?,?,?)', (event['eventId'], key, raw, time.time()))
        self.db.commit()
        ws = self.connections.get(key)
        if ws and not ws.closed:
            await ws.send_str(raw)

    async def on_message(self, message):
        if message.author.bot or not message.content or str(message.channel.id) not in self.channels:
            return
        await self.queue(message.channel.id, {'type': 'discord', 'id': str(message.id), 'author': str(message.author.id),
                                             'name': message.author.display_name, 'text': message.content[:300]})

    async def on_raw_message_edit(self, payload):
        if 'content' in payload.data:
            await self.queue(payload.channel_id, {'type': 'discordEdit', 'id': str(payload.message_id), 'text': payload.data['content'][:300]})

    async def on_raw_message_delete(self, payload):
        await self.queue(payload.channel_id, {'type': 'discordDelete', 'id': str(payload.message_id)})

    async def on_raw_bulk_message_delete(self, payload):
        for message_id in payload.message_ids:
            await self.queue(payload.channel_id, {'type': 'discordDelete', 'id': str(message_id)})

    async def on_interaction(self, interaction):
        if interaction.type != discord.InteractionType.application_command:
            return
        name = (interaction.data or {}).get('name')
        if name not in {command['name'] for command in COMMANDS}:
            return
        await interaction.response.defer(ephemeral=True, thinking=True)
        try:
            if name == '랜드':
                await interaction.followup.send('작은 마을로 놀러 와요. ' + LAND_URL, ephemeral=True)
                return
            options = {o['name']: o.get('value') for o in interaction.data.get('options', [])}
            if name == '랜드연결':
                await self.land('link', {'code': str(options.get('코드', '')).upper(), 'discordId': str(interaction.user.id)})
                await interaction.followup.send('주민과 Discord 계정을 연결했어요. 마을 프로필에서 연결 상태를 새로 확인해주세요.', ephemeral=True)
                return
            if not interaction.guild or not isinstance(interaction.user, discord.Member):
                raise RuntimeError('서버 안에서 사용해주세요.')
            permissions = interaction.user.guild_permissions
            if not (permissions.administrator or permissions.manage_guild or interaction.user.id == interaction.guild.owner_id):
                raise RuntimeError('서버 관리 권한이 있어야 연결을 바꿀 수 있어요.')
            requested = options.get('채널') or options.get('음성방')
            channel = interaction.guild.get_channel(int(requested)) if requested else interaction.channel if isinstance(interaction.channel, discord.VoiceChannel) else getattr(interaction.user.voice, 'channel', None)
            if not isinstance(channel, (discord.VoiceChannel, discord.TextChannel)):
                raise RuntimeError('연결할 일반채널 또는 음성방을 명령 옵션에서 선택해주세요.')
            if name == '랜드방해제':
                await self.land('unregister', {'guild': str(interaction.guild.id), 'channel': str(channel.id)})
                task = self.tasks.pop(f'd:{interaction.guild.id}:{channel.id}', None)
                if task:
                    task.cancel()
                self.channels.pop(str(channel.id), None)
                await interaction.followup.send('이 음성방의 마을 채팅 연동을 해제했어요.', ephemeral=True)
                return
            own = channel.permissions_for(interaction.guild.me)
            if not all((own.view_channel, own.read_message_history, own.send_messages)) or isinstance(channel, discord.VoiceChannel) and not own.connect:
                raise RuntimeError('봇에게 채널 보기·연결·메시지 기록 보기·메시지 보내기 권한이 필요해요.')
            await self.land('register', {'guild': str(interaction.guild.id), 'channel': str(channel.id), 'name': channel.name})
            data = await self.land('channels', {})
            item = next(c for c in data['channels'] if c['channel_id'] == str(channel.id))
            self.channels[str(channel.id)] = item
            if item['room'] not in self.tasks or self.tasks[item['room']].done():
                self.tasks[item['room']] = asyncio.create_task(self.room_loop(item))
            await interaction.followup.send('채널의 문자 채팅을 마을과 연결했어요. 연결된 주민 중 채널 권한이 있는 분만 볼 수 있어요. 일반채널은 옆 채팅창에서, 음성방은 광장 목록에서도 선택할 수 있어요.', ephemeral=True)
        except Exception as error:
            log.warning('User command failed: %s', type(error).__name__)
            await interaction.followup.send(str(error)[:300], ephemeral=True, allowed_mentions=discord.AllowedMentions.none())

    async def close(self):
        if self.refresh_task:
            self.refresh_task.cancel()
        for task in self.tasks.values():
            task.cancel()
        if self.session:
            await self.session.close()
        self.db.close()
        await super().close()


def main():
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(name)s %(levelname)s %(message)s')
    logging.getLogger('discord').setLevel(logging.WARNING)
    config = json.loads(sys.stdin.readline())
    bridge = Bridge(config)
    bridge.run(bridge.bot_token, log_handler=None)


if __name__ == '__main__':
    main()
