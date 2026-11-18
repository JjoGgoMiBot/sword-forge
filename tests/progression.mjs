import {expectedProgression} from './progression-model.mjs';
const builds={untrained:{},smithLevel40:{dex:15,focus:15,str:5,trade:10,luck:5}};
const rows=[];
for(const [build,stats]of Object.entries(builds))for(const target of [7,10,12,15,17,18,19,20])for(const protect of [false,true])rows.push({build,...expectedProgression(target,stats,protect)});
console.log(JSON.stringify({assumptions:'Fixed stats; events declined; +0 start; protection either absent or always stocked. Gold includes upgrade fees only, not scroll acquisition or income farming. Not an estimate of total play time.',rows},null,2));
