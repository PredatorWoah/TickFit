// build.js
// The "Build one for me" screen: a short form, then a preview, then the plan is created on the
// device. Nothing is sent anywhere. Your answers are remembered here so you can tweak them later.

import { h, clear, copyText, toast } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { getState, setSetting, addPlan } from './store.js';
import { validatePlan } from './parser.js';
import { buildPlan, validateProfile, describeProfile, dayDiets, GOALS, DIET_NAMES } from './builder.js';
import { buildPrompt } from './ai.js';
import { todayStr } from './dates.js';

const DEFAULTS = { sex: 'male', age: '', heightCm: '', weightKg: '', goal: 'muscle', experience: 'beginner', days: 3, equip: 'gym', minutes: 60, cardio: 'some', life: 'moving', diet: 'veg', dietMode: 'one', nonvegDays: 2, dayDiets: ['veg', 'veg', 'veg', 'veg', 'veg', 'veg', 'veg'], avoid: [] };
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const GOAL_TEXT = {
  lose: 'Burn fat while keeping your muscle',
  muscle: 'Gain size and shape',
  strength: 'Lift heavier over time',
  fit: 'Feel good, stay healthy and strong',
  endurance: 'Run, cycle or play longer without getting tired',
};

export function renderBuild(root, actions) {
  clear(root);
  // Start from your last answers if you have used the builder before.
  const saved = getState().settings.profile || {};
  const p = { ...DEFAULTS, ...saved, avoid: [...(saved.avoid || [])] };
  p.dayDiets = Array.isArray(saved.dayDiets) && saved.dayDiets.length === 7 ? [...saved.dayDiets] : [...DEFAULTS.dayDiets];
  const messages = h('div', { class: 'messages', 'aria-live': 'polite' });

  const redraw = () => {
    const y = window.scrollY;
    renderBuild(root, actions);
    window.scrollTo(0, y);
  };
  const set = (key, value) => {
    if (key === 'dietMode' && value === 'perday' && (p.dietMode || 'one') !== 'perday') {
      // start the per-day choices from what you had (the mixed pattern, or your single diet)
      p.dayDiets = dayDiets({ ...p, dietMode: p.dietMode || 'one' });
    }
    p[key] = value;
    setSetting('profile', p); // remembered on this device
    redraw();
  };

  /** A row of big buttons where one is selected. */
  const seg = (key, options, label, wrap) =>
    h(
      'div',
      { class: 'seg' + (wrap ? ' wrap' : ''), role: 'group', 'aria-label': label },
      options.map(([value, text]) => h('button', { type: 'button', 'aria-pressed': String(p[key] === value), onclick: () => set(key, value) }, text))
    );

  const question = (title, hint, ...children) => h('section', { class: 'q' }, h('h2', {}, title), hint && h('p', { class: 'hint tight' }, hint), ...children);

  const num = (key, label, unit) => {
    const input = h('input', {
      type: 'number',
      inputMode: 'decimal',
      min: 0,
      step: 'any',
      'aria-label': `${label} in ${unit}`,
      oninput: (e) => {
        const v = parseFloat(e.target.value);
        p[key] = isFinite(v) ? v : '';
        setSetting('profile', p);
      },
    });
    input.value = p[key] ?? '';
    return h('label', { class: 'f' }, h('span', {}, `${label} (${unit})`), input);
  };

  /** The "What you eat" question: one diet, a mix, or a diet for each day. */
  const dietQuestion = () => {
    const mode = p.dietMode || 'one';
    const parts = [seg('dietMode', [['one', 'Same every day'], ['mixed', 'Mixed'], ['perday', 'Pick per day']], 'How your diet varies')];
    if (mode === 'one') {
      parts.push(seg('diet', [['veg', 'Vegetarian'], ['egg', 'Eggetarian'], ['nonveg', 'Non-veg'], ['vegan', 'Vegan']], 'Diet', true));
    } else if (mode === 'mixed') {
      const nv = dayDiets({ ...p, dietMode: 'mixed' }).map((d, i) => (d === 'nonveg' ? DAY_NAMES[i] : null)).filter(Boolean);
      parts.push(
        h('p', { class: 'hint tight' }, 'Your main diet most days:'),
        seg('diet', [['veg', 'Vegetarian'], ['egg', 'Eggetarian'], ['vegan', 'Vegan']], 'Main diet'),
        h('p', { class: 'hint tight' }, 'Days a week you eat non-veg:'),
        seg('nonvegDays', [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], 'Non-veg days a week'),
        h('p', { class: 'hint' }, `Non-veg on ${nv.join(', ')}. The other days follow your main diet. You can change any day later by choosing "Pick per day".`)
      );
    } else {
      parts.push(
        h(
          'div',
          { class: 'daydiets' },
          DAY_NAMES.map((name, i) =>
            h(
              'div',
              { class: 'daydiet', role: 'group', 'aria-label': `Diet on ${name}` },
              h('span', { class: 'daydiet-name' }, name),
              [['veg', 'Veg'], ['egg', 'Egg'], ['nonveg', 'Non-veg'], ['vegan', 'Vegan']].map(([value, text]) =>
                h('button', { type: 'button', 'aria-pressed': String(p.dayDiets[i] === value), 'aria-label': `${name} ${DIET_NAMES[value]}`, onclick: () => setDayDiet(i, value) }, text)
              )
            )
          )
        )
      );
    }
    return question('What you eat', 'Meals use Indian home cooking.', ...parts);
  };
  const setDayDiet = (i, value) => {
    p.dayDiets = p.dayDiets.map((d, j) => (j === i ? value : d));
    setSetting('profile', p);
    redraw();
  };

  const avoidChip = (value, text) =>
    h(
      'button',
      {
        type: 'button',
        class: 'chipbtn',
        'aria-pressed': String(p.avoid.includes(value)),
        onclick: () => set('avoid', p.avoid.includes(value) ? p.avoid.filter((v) => v !== value) : [...p.avoid, value]),
      },
      text
    );

  function profileOrErrors() {
    const profile = { ...p, age: Number(p.age), heightCm: Number(p.heightCm), weightKg: Number(p.weightKg), days: Number(p.days), nonvegDays: Number(p.nonvegDays) };
    const check = validateProfile(profile);
    clear(messages);
    if (!check.ok) {
      messages.append(h('div', { class: 'msg error' }, h('b', {}, 'A few things to fix:'), h('ul', {}, check.errors.map((e) => h('li', {}, e)))));
      return null;
    }
    return profile;
  }

  function preview() {
    const profile = profileOrErrors();
    if (!profile) return;
    const { plan, summary } = buildPlan(profile);
    const varied = new Set(summary.dayDiets).size > 1; // show each day's diet when it changes through the week
    const firstTraining = plan.days.find((d) => d.workout.length && !/Cardio/.test(d.label)) || plan.days[0];

    openSheet({
      title: 'Your plan',
      build(body, close) {
        const stat = (value, label) => h('div', { class: 'stat' }, h('div', { class: 'stat-value small' }, String(value)), h('div', { class: 'stat-label' }, label));
        body.append(
          h('p', { class: 'sheet-target' }, `${GOALS[profile.goal]} · ${profile.days} training days a week`),
          h('div', { class: 'stats four' }, stat(summary.calories, 'kcal a day'), stat(`${summary.protein} g`, 'protein'), stat(`${summary.carbs} g`, 'carbs'), stat(`${summary.fat} g`, 'fat')),
          h('p', { class: 'hint' }, `Your body uses about ${summary.bmr} kcal a day at rest, and about ${summary.tdee} kcal with your activity. The calories above are set from that for your goal.`),
          ...summary.notes.map((n) => h('div', { class: 'msg warn' }, n)),
          h('h2', {}, 'Your week'),
          h('ul', { class: 'week-list' }, plan.days.map((d, i) => h('li', {}, h('b', {}, d.label.split(' ')[0].slice(0, 3)), h('span', {}, d.label.split(' ').slice(1).join(' ') || 'Rest', varied && h('small', { class: 'diet-tag' }, DIET_NAMES[summary.dayDiets[i]]))))),
          h('h2', {}, firstTraining.label),
          h('ul', { class: 'mini-list' }, firstTraining.workout.map((w) => h('li', {}, w.exercise, h('span', {}, w.sets === 1 ? w.reps : `${w.sets} × ${w.reps}`)))),
          h('p', { class: 'hint' }, 'You can edit every exercise and meal afterwards. Videos can be added per exercise, or tap "Form video" on any exercise to search.'),
          h('p', { class: 'hint' }, 'This is general guidance, not medical advice. If you have a medical condition, are pregnant or are recovering from an injury, check with a doctor first.'),
          h(
            'button',
            {
              class: 'btn primary wide big',
              type: 'button',
              onclick: () => {
                const result = validatePlan(plan);
                if (!result.ok) return toast('Something went wrong building that plan. Please tell the developer.');
                addPlan(result.plan, todayStr());
                close();
                toast('Plan created');
                actions.show('today');
              },
            },
            'Create this plan'
          ),
          h('button', { class: 'btn ghost wide', type: 'button', onclick: close }, 'Change my answers')
        );
      },
    });
  }

  async function copyPrompt() {
    const profile = profileOrErrors();
    if (!profile) return;
    toast((await copyText(buildPrompt(describeProfile(profile), { create: true }))) ? 'Prompt copied. Paste it into a chatbot.' : 'Could not copy');
  }

  root.append(
    h('div', { class: 'edit-bar' }, h('button', { class: 'btn ghost back-btn', type: 'button', onclick: () => actions.show('new') }, icon('back', 20), 'Back'), h('h1', { class: 'page-title tight' }, 'Build my plan')),
    h('p', { class: 'hint' }, 'Answer a few questions and TickFit builds a full workout and meal plan on this phone. Your answers never leave it.'),

    question('About you', null, seg('sex', [['male', 'Male'], ['female', 'Female'], ['other', 'Other']], 'Sex'), h('div', { class: 'grid3 even' }, num('age', 'Age', 'years'), num('heightCm', 'Height', 'cm'), num('weightKg', 'Weight', 'kg'))),

    question(
      'Your goal',
      null,
      h(
        'div',
        { class: 'options tight' },
        Object.entries(GOALS).map(([value, text]) =>
          h(
            'button',
            { class: 'option' + (p.goal === value ? ' sel' : ''), type: 'button', 'aria-pressed': String(p.goal === value), onclick: () => set('goal', value) },
            h('span', { class: 'option-text' }, h('b', {}, text), h('span', {}, GOAL_TEXT[value])),
            p.goal === value && icon('check', 22)
          )
        )
      )
    ),

    question('Training experience', 'Be honest, a gentler start is safer.', seg('experience', [['beginner', 'New'], ['intermediate', 'Some'], ['advanced', 'Experienced']], 'Experience')),
    question('Days a week you can train', null, seg('days', [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], 'Training days per week')),
    question('Where you train', null, seg('equip', [['gym', 'Gym'], ['dumbbell', 'Home + dumbbells'], ['bodyweight', 'Home, no equipment']], 'Equipment')),
    question('Time per session', null, seg('minutes', [[30, '30 min'], [45, '45 min'], [60, '60 min'], [75, '75 min']], 'Session length')),
    question('Cardio', 'Walking, cycling or the treadmill on top of weights.', seg('cardio', [['little', 'A little'], ['some', 'Some'], ['lots', 'A lot']], 'Cardio')),
    question('Your day-to-day', 'Outside of workouts.', seg('life', [['desk', 'Mostly sitting'], ['moving', 'Moving some'], ['physical', 'Physical job']], 'Daily activity')),
    dietQuestion(),
    question('Anything to avoid?', 'We leave out exercises that stress these.', h('div', { class: 'chips' }, avoidChip('knee', 'Bad knees'), avoidChip('back', 'Lower back pain'), avoidChip('shoulder', 'Shoulder pain'))),

    messages,
    h('button', { class: 'btn primary wide big', type: 'button', onclick: preview }, icon('sparkle', 22), 'Build my plan'),
    h('button', { class: 'btn ghost wide', type: 'button', onclick: copyPrompt }, 'Or copy a prompt for a chatbot')
  );
}
