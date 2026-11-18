import test from 'node:test';
import assert from 'node:assert/strict';
import {expectedProgression} from './progression-model.mjs';
test('endgame stays demanding while smith growth provides a meaningful path through it',()=>{
  const trained={dex:15,focus:15,str:5,trade:10,luck:5};
  const novice=expectedProgression(20),grown=expectedProgression(20,trained),protectedBuild=expectedProgression(20,trained,true);
  assert.ok(grown.attempts<novice.attempts*.6,'investing 50 legal smith points must substantially reduce rebuilding');
  assert.ok(grown.attempts>1000,'unprotected final progression should remain a long-term goal');
  assert.ok(protectedBuild.attempts>100&&protectedBuild.attempts<5000,'stocked protection must help without an absurd number of endgame rolls');
  assert.ok(expectedProgression(15,trained).gold<expectedProgression(18,trained).gold);
  assert.ok(expectedProgression(18,trained).gold<grown.gold);
});
