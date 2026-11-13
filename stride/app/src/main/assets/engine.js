'use strict';

const MODES = { machines:'Gym · Machines + dumbbells', free:'Gym · Dumbbells', home:'Home · Bodyweight' };
const FOCUS = ['Chest · Upper','Chest · Middle','Chest · Lower','Back','Shoulders','Biceps','Triceps','Legs','Core','Cardio','Rest'];
const GROUPS = {
  'Chest · Upper': ['Incline Chest Press Machine','Incline Dumbbell Press','Decline Push-up'],
  'Chest · Middle': ['Machine Chest Press','Dumbbell Bench Press (Flat)','Push-up'],
  'Chest · Lower': ['High to Low Cable Fly','Decline Dumbbell Press','Incline Push-up'],
  Back: ['Lat Pulldown','Single Arm Dumbbell Row','Prone W Raise'],
  Shoulders: ['Shoulder Press Machine','Dumbbell Lateral Raise','Pike Push-up'],
  Biceps: ['Machine Preacher Curl','Dumbbell Bicep Curl','Self-resisted Biceps Curl'],
  Triceps: ['Tricep Rope Pushdown','Overhead Dumbbell Tricep Extension','Diamond Push-up'],
  Legs: ['Leg Press','Goblet Squat','Bodyweight Squat'],
  Core: ['Kneeling Cable Crunch','Dumbbell Suitcase Carry','Dead Bug'],
  Cardio: ['Easy Cycle','Incline Walk','Brisk Walk']
};
const EXTRA = {
  Back:['Seated Cable Row','Chest Supported Dumbbell Row','Prone Lat Sweep'],
  Shoulders:['Reverse Pec Deck (Rear Delts)','Seated Dumbbell Shoulder Press','Wall Slide'],
  Legs:['Seated Leg Curl','Dumbbell Romanian Deadlift','Glute Bridge'],
  Core:['Plank','Side Plank','Reverse Crunch']
};
function classify(name, category='') {
  const n = name.toLowerCase();
  if (/\bwalk\b|cycle|treadmill|jog|elliptical/.test(n)) return ['Cardio','Whole body'];
  if (/calf/.test(n)) return ['Legs','Calves'];
  if (/leg curl|romanian|deadlift/.test(n)) return ['Legs','Hamstrings'];
  if (/hip thrust|bridge/.test(n)) return ['Legs','Glutes'];
  if (/squat|lunge|leg press|leg extension/.test(n)) return ['Legs','Quadriceps'];
  if (/crunch|plank|dead bug|knee raise/.test(n)) return ['Core',/side plank/.test(n)?'Obliques':'Abdominals'];
  if (/carry/.test(n)) return ['Core','Obliques'];
  if (/tricep|skull crusher|pushdown|diamond|seated dip|overhead rope extension/.test(n)) return ['Triceps',/overhead|skull/.test(n)?'Triceps · long head':'Triceps'];
  if (/reverse pec|reverse fly|face pull|prone w/.test(n)) return ['Shoulders','Rear delts'];
  if (/lateral raise/.test(n)) return ['Shoulders','Side delts'];
  if (/shoulder press|arnold|pike|wall slide/.test(n)) return ['Shoulders','Front delts'];
  if (/curl/.test(n)) return ['Biceps',/hammer/.test(n)?'Brachialis and biceps':'Biceps'];
  if (/pulldown|pull down|pull.?up|pullover|vertical pull|lat sweep/.test(n)) return ['Back','Lats'];
  if (/back extension|superman/.test(n)) return ['Back','Lower back'];
  if (/row/.test(n)) return ['Back','Mid back and lats'];
  if (/low to high|incline.*(press|fly)|decline push/.test(n)) return ['Chest · Upper','Upper chest'];
  if (/high to low|decline|chest dip|incline push/.test(n)) return ['Chest · Lower','Lower chest'];
  if (/chest|bench press|pec deck|crossover|flat.*fly|push.?up/.test(n)) return ['Chest · Middle','Mid chest'];
  return [FOCUS.includes(category)?category:category==='Chest'?'Chest · Middle':'Other', category && category!=='Other'?category:'Target unclassified'];
}
function equipment(name) {
  if (/dumbbell|goblet|arnold|hammer curl|concentration curl/.test(name.toLowerCase()) && !/cable/.test(name.toLowerCase())) return 'dumbbell';
  if (/^incline walk$/.test(name.toLowerCase())) return 'machine';
  if (/machine|cable|pulldown|pushdown|pec deck|leg press|leg extension|leg curl|hack squat|smith|cycle|captain|preacher|face pull|crossover/.test(name.toLowerCase())) return 'machine';
  if (/push.?up|bodyweight|prone|plank|dead bug|crunch|bridge|wall slide|supported split|superman|brisk walk|self.resisted|standing calf raise/.test(name.toLowerCase())) return 'bodyweight';
  return 'other';
}
function formLink(name, video) {
  try {
    const u = new URL(video);
    if (u.protocol==='https:' && ['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(u.hostname)) return u.href;
  } catch {}
  return 'https://www.youtube.com/results?search_query='+encodeURIComponent(name+' exercise proper form tutorial');
}
function exerciseInfo(item) {
  const [focus,target] = classify(item.exercise,item.category);
  return {...item,focus,target,equipment:equipment(item.exercise),video:formLink(item.exercise,item.video)};
}
function parseLibrary(json) {
  const {data} = JSON.parse(json);
  const exercises = new Map();
  const add = item => {
    if (typeof item?.exercise!=='string' || !item.exercise.trim() || /^(new exercise|vertical pull)$/i.test(item.exercise.trim())) return;
    const info = exerciseInfo(item);
    const id = norm(item.exercise);
    const previous = exercises.get(id);
    if (!previous || (item.video && previous.video.includes('/results?'))) {
      const {exercise,focus,target,equipment,video} = info;
      exercises.set(id,{exercise,focus,target,equipment,video});
    }
  };
  for (const plan of data.plans) {
    for (const item of [...(plan.days || []).flatMap(day=>day.workout || []),...(plan.library?.exercises || [])]) {
      add(item);
      for (const alt of item.alternatives || []) add({...item,...alt,video:alt.video || ''});
    }
  }
  return [...exercises.values()];
}
const EQUIPMENT = {machine:'Machines / cables', dumbbell:'Dumbbells', bodyweight:'Bodyweight', other:'Other equipment'};
function equipmentList(mode) {
  return Array.isArray(mode) ? mode : ({machines:['machine','dumbbell','bodyweight'],free:['dumbbell','bodyweight'],home:['bodyweight']}[mode] || []);
}
function catalog(library=[]) {
  const blocks = typeof module === 'undefined' ? EXERCISE_BLOCKS : require('./catalog.js');
  const builtIn = blocks.flatMap(([focus,target,equipment,names])=>names.split('|').map(exercise=>({
    exercise,focus,target,equipment,video:formLink(exercise)
  })));
  const merged = new Map(library.map(item=>[norm(item.exercise),item]));
  for (const item of builtIn) {
    const id = norm(item.exercise);
    const imported = merged.get(id);
    merged.set(id,imported?{...item,video:imported.video}:item);
  }
  return [...merged.values()];
}
function choices(focus, mode, library=[]) {
  const allowed = equipmentList(mode);
  const candidates = catalog(library).filter(item=>item.focus===focus && allowed.includes(item.equipment));
  const defaults = [...(GROUPS[focus] || []),...(EXTRA[focus] || [])];
  const order = new Map(defaults.map((name,i)=>[norm(name),i]));
  const imported = new Set(library.map(item=>norm(item.exercise)));
  const rank = item => imported.has(norm(item.exercise)) ? -1 : (order.get(norm(item.exercise)) ?? 999);
  return candidates.sort((a,b)=>rank(a)-rank(b));
}
const DEFAULTS = { mode:'machines', level:'New', days:3, minutes:40, goal:'General fitness' };
const norm = text => String(text || '').toLowerCase().replace(/[^a-z0-9]/g,'');
const dateKey = (date = new Date()) => [date.getFullYear(), date.getMonth()+1, date.getDate()].map(x=>String(x).padStart(2,'0')).join('-');
function offset(date, days) {
  const value = new Date(date + 'T12:00:00');
  value.setDate(value.getDate() + days);
  return dateKey(value);
}
function parseBackup(json) {
  const backup = JSON.parse(json);
  if (backup?.app !== 'tickfit' || backup.backupVersion !== 1 ||
      !Array.isArray(backup.data?.plans) || !backup.data?.progress) {
    throw new Error('Choose a TickFit version 1 backup.');
  }
  const history = [];
  const weekday = label => ['mon','tue','wed','thu','fri','sat','sun'].indexOf(
    String(label || '').match(/^\s*(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i)?.[1]?.slice(0,3).toLowerCase()
  );
  for (const plan of backup.data.plans) {
    if (!plan?.days?.length || !/^\d{4}-\d{2}-\d{2}$/.test(plan.startDate)) continue;
    const weekdays = plan.days.map(day=>weekday(day.label));
    const weekly = weekdays.every(day=>day>=0) && new Set(weekdays).size===weekdays.length;
    for (const [date, progress] of Object.entries(backup.data.progress[plan.id] || {})) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !progress) continue;
      const difference = Math.round((Date.parse(date) - Date.parse(plan.startDate)) / 86400000);
      if (!Number.isFinite(difference)) continue;
      const index = weekly ? weekdays.indexOf((new Date(date+'T12:00:00').getDay()+6)%7) :
        ((difference % plan.days.length) + plan.days.length) % plan.days.length;
      const day = plan.days[index];
      const available = [...(plan.library?.exercises || []), ...(day?.workout || [])];
      const names = new Map();
      for (const item of available) {
        names.set(item.id,item.exercise);
        item.alternatives?.forEach((variant,i)=>names.set(item.id+'~'+(i+1),variant.exercise || item.exercise));
      }
      const lifts = [];
      for (const [id, sets] of Object.entries(progress.sets || {})) {
        if (!Array.isArray(sets)) continue;
        const completed = sets.filter(set => set?.done === true).map(set => ({
          reps:Number(set.r) || null, kg:set.w !== '' && set.w != null && Number.isFinite(Number(set.w)) ? Number(set.w) : null
        }));
        if (!completed.length) continue;
        const name = names.get(id) || (id.startsWith('lx-') ? id.slice(3).replace(/-/g,' ') : '');
        lifts.push({name:name || 'Unmatched exercise', sets:completed});
      }
      if (lifts.length) history.push({date,lifts});
    }
  }
  // TickFit can carry identical progress forward into a second plan.
  const seen = new Set();
  return history.sort((a,b)=>b.date.localeCompare(a.date)).filter(entry => {
    const signature = JSON.stringify([entry.date, entry.lifts.map(lift => JSON.stringify([norm(lift.name),lift.sets])).sort()]);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  }).slice(0,90);
}
function session(date, focus, config, history, library=[], selection=null) {
  const focuses = Array.isArray(focus) ? focus : [focus];
  const sets = config.level === 'New' || config.minutes < 35 ? 2 : 3;
  const maxMoves = Math.min(6, Math.max(focuses.length, Math.floor((config.minutes-5)/(sets*2.5))));
  const pools = focuses.map(group=>choices(group,config.mode,library));
  const available = pools.flat();
  const ranked = [];
  const seen = new Set();
  for (let i=0; i<Math.max(0,...pools.map(pool=>pool.length)); i++) {
    for (const pool of pools) {
      const item = pool[i];
      if (item && !seen.has(norm(item.exercise))) {
        ranked.push(item);
        seen.add(norm(item.exercise));
      }
    }
  }
  const picked = selection ? [...new Set(selection)].map(id=>available.find(item=>norm(item.exercise)===id)).filter(Boolean) :
    ranked.slice(0,Math.min(maxMoves,focuses[0]==='Cardio'?1:focuses.length===1?4:maxMoves));
  const workout = picked.map(item=>{
    const {exercise,target,video} = item;
    const last = history.filter(entry=>entry.date<date).flatMap(entry=>entry.lifts).find(lift=>norm(lift.name)===norm(exercise));
    const lastSet = last?.sets?.at(-1);
    const reference = lastSet?.reps ? ' Last logged: '+lastSet.reps+' reps'+(lastSet.kg===null?'':' at '+lastSet.kg+' kg')+'.' : '';
    const cardio = item.focus==='Cardio';
    const timed = /(?<!bird dog |tap |shoulder )plank|wall sit|hold|isometric/i.test(exercise) && !/tap|dip|reach/i.test(exercise);
    const strength = config.goal==='Strength' && config.level!=='New' && equipmentList(config.mode).some(type=>type!=='bodyweight');
    return {id:'stride-'+norm(exercise),exercise,target,focus:item.focus,sets:cardio?1:sets,
      reps:cardio?config.minutes+' min':timed?'20–40 sec':strength?'5–8':'8–12',
      weight:'',rest:cardio?'':strength?'120 sec':'90 sec',
      notes:cardio?'Use a pace where you can still talk.':'Leave 2–3 reps in reserve. Progress when all sets reach the top of the range at that effort.'+reference,video};
  });
  return {date,label:focuses.join(' + '),workout,meals:[],extras:{waterLiters:null,supplements:[],notes:''}};
}
function week(start, config, history, library=[]) {
  const splits = {
    2: [['Chest · Upper','Chest · Middle','Shoulders','Triceps','Legs'],['Back','Biceps','Chest · Lower','Legs','Core']],
    3: [['Chest · Upper','Chest · Middle','Chest · Lower','Triceps'],['Back','Biceps','Shoulders'],['Legs','Core']],
    4: [['Chest · Upper','Chest · Middle','Chest · Lower','Triceps'],['Back','Biceps'],['Legs','Core'],['Shoulders','Core']],
    5: [['Chest · Upper','Chest · Middle','Chest · Lower'],['Back','Biceps'],['Legs'],['Shoulders','Triceps'],['Core','Legs']],
    6: [['Chest · Upper','Chest · Middle','Chest · Lower'],['Back'],['Legs'],['Shoulders'],['Biceps','Triceps'],['Core','Legs']]
  };
  const rotation = splits[config.days];
  const train = new Map(rotation.map((group,i)=>[Math.floor(i*7/rotation.length),group]));
  const cardioDay = config.goal==='General fitness' ? [...Array(7).keys()].find(i=>!train.has(i)) : -1;
  return Array.from({length:7},(_,i)=>session(offset(start,i),train.get(i) || (i===cardioDay?'Cardio':'Rest'),config,history,library));
}
function transfer(scope, days) {
  const cleanDays = days.map(({date,label,workout,meals,extras})=>({date,label,workout,meals,extras}));
  return {app:'tickfit',format:'stride-workout',version:1,scope,
    plan:{name:scope === 'day' ? 'Stride · ' + days[0].label : 'Stride · Weekly plan',startDate:days[0].date,days:cleanDays}};
}
if (typeof module !== 'undefined') module.exports = {DEFAULTS, MODES, parseBackup, parseLibrary, choices, catalog, equipmentList, FOCUS, dateKey, offset, session, week, transfer};
