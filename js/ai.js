// ai.js
// The "Copy AI prompt" text. The user pastes it into any free chatbot together with
// their plan document, the chatbot answers with JSON, and that JSON is pasted into TickFit.
//
// Keep this in sync with parser.js: if you change the format, change it here too.

const EXAMPLE = {
  name: 'Beginner Muscle Plan',
  days: [
    {
      label: 'Day 1 Push',
      workout: [
        { exercise: 'Bench Press', sets: 3, reps: '8 to 10', rest: '90s', weight: '20 kg', notes: 'Control the lowering' },
        { exercise: 'Plank', sets: 3, reps: '30 sec', rest: '45s', notes: '' },
      ],
      meals: [
        { time: '8:00 AM', name: 'Breakfast', items: ['Paneer bhurji', '2 rotis'], calories: 450, protein: 25 },
        { time: '1:00 PM', name: 'Lunch', items: ['Dal', 'Rice', 'Salad'], calories: 600, protein: 22 },
      ],
      extras: { waterLiters: 3, supplements: ['Creatine 5g'], notes: 'Warm up first' },
    },
    {
      label: 'Day 2 Rest',
      workout: [],
      meals: [{ time: '8:00 AM', name: 'Breakfast', items: ['Poha', '1 glass milk'] }],
      extras: { waterLiters: 2.5, supplements: [], notes: 'Rest day' },
    },
  ],
};

/**
 * The full prompt. With no argument it ends with a placeholder for the user to paste their
 * document under. With `docText` the document is already included (used for Gemini and for
 * "Copy prompt with my text").
 */
export function buildPrompt(docText = '') {
  return `You convert a workout and meal plan into JSON for a checklist app called TickFit.

I will paste my plan document below this message. Read it and return the plan in EXACTLY this JSON format.

SCHEMA
{
  "name": string,                       // name of the plan
  "days": [                             // one entry per day, in order. A weekly plan = 7 days.
    {
      "label": string,                  // e.g. "Day 1 Push"
      "workout": [                      // empty list [] on rest days
        {
          "exercise": string,           // required
          "sets": number,               // optional
          "reps": string,               // optional, e.g. "8 to 10" or "30 sec"
          "rest": string,               // optional, e.g. "90s"
          "weight": string,             // optional target, e.g. "20 kg" or "bodyweight"
          "notes": string,              // optional
          "video": string               // optional link, ONLY if the document contains a real URL
        }
      ],
      "meals": [                        // required, can be []
        {
          "time": string,               // optional, e.g. "8:00 AM"
          "name": string,               // required, e.g. "Breakfast"
          "items": [string],            // required, at least one food
          "calories": number,           // optional, only if the document says so
          "protein": number             // optional, grams, only if the document says so
        }
      ],
      "extras": {                       // optional
        "waterLiters": number,
        "supplements": [string],
        "notes": string
      }
    }
  ]
}

EXAMPLE
${JSON.stringify(EXAMPLE, null, 2)}

RULES
1. Return ONLY valid JSON. No explanation, no greeting, no markdown, no code fences.
2. Use double quotes for all keys and strings. No trailing commas. No comments.
3. Every day must have both "workout" and "meals". Use [] for a rest day workout.
4. Do not invent exercises, foods, calories, protein, weights or video links. If the document does not say, leave the field out.
5. If the document describes one week that repeats and has no weekday names, return 7 days for that week. If it spans several weeks, return every day. (Weekday named plans: see rule 9.)
6. Use numbers for sets, calories, protein and waterLiters. Use text for reps, rest and time.
7. Keep my wording for exercise and food names.
8. Keep the JSON compact (no extra whitespace) so the whole plan fits in one reply.
9. If the plan is a weekly schedule (Monday, Tuesday and so on), start every "label" with the weekday name, for example "Monday Chest + Triceps", and list each weekday once. Weekdays you leave out become rest days. Do not use weekday names in labels for plans that are not tied to real weekdays.
10. Put the same long advice paragraph in only ONE place (the first day's "notes"), not repeated in every day.

MY PLAN DOCUMENT:
${docText ? docText.trim() : '(paste it here)'}
`;
}
