/**
 * Hearth Month — a small, replayable finance life-sim for the Learn room.
 *
 * One fictional month (4 weeks) of someone's life in DA: income lands, bills
 * come due, and 1–2 life events a week ask for a choice. Every choice has
 * explicit effects (cash, jar, IOUs, warmth) and some land later — an
 * installment becomes next week's bill, a loan may or may not come back.
 *
 * Tone rules (shared with the curriculum): forecasts, not verdicts. There is
 * no fail state. Cash never goes negative — a shortfall becomes a small family
 * IOU; an unpaid bill rolls into a gentle catch-up list. The ending names
 * what happened and what it traded, never a grade.
 *
 * Pure and deterministic: all chance comes from a seeded mulberry32 whose
 * state lives in GameState.rng, so a seed plus a list of choices always
 * replays the same month. No Math.random, no wall clock in here.
 */

import { installment } from './simulator.ts'
import { fmtDA } from './money.ts'
import { NODE_IDS } from '../content/curriculum.ts'

/* ------------------------------- PRNG -------------------------------- */

/** One mulberry32 step: returns [value in [0,1), next state]. */
export function mulberry32(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) | 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next]
}

/** Draw from the state's stream, advancing it in place (on a working copy). */
function rand(s: GameState): number {
  const [v, next] = mulberry32(s.rng)
  s.rng = next
  return v
}

const round100 = (n: number) => Math.round(n / 100) * 100
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/* ----------------------------- characters ---------------------------- */

export type CharacterId = 'samira' | 'yacine' | 'lina' | 'karim'

export interface Character {
  id: CharacterId
  name: string
  /** "26 · Oran" style tag line. */
  who: string
  /** One-line situation shown on the picker. */
  situation: string
  startCash: number
  startJar: number
  /** Event amounts are scaled by this so a student's month stays a student's month. */
  scale: number
  /** Groceries and transport, spent at the start of every week. */
  weekly: number
  /** Things already scheduled past this month (shown in the summary). */
  aheadNote?: string
}

export const CHARACTERS: ReadonlyArray<Character> = [
  {
    id: 'samira',
    name: 'Samira',
    who: '26 · admin assistant · Oran',
    situation: 'Salaried: 60,000 DA lands on the 1st, rent is 18,000.',
    startCash: 5_000,
    startJar: 8_000,
    scale: 1,
    weekly: 6_000,
  },
  {
    id: 'yacine',
    name: 'Yacine',
    who: '29 · freelance designer · Algiers',
    situation: 'Freelance: clients pay in two or three uneven chunks.',
    startCash: 14_000,
    startJar: 5_000,
    scale: 1,
    weekly: 6_000,
  },
  {
    id: 'lina',
    name: 'Lina',
    who: '20 · student · Constantine',
    situation: 'Student: a family allowance plus weekend café shifts, no jar yet.',
    startCash: 2_000,
    startJar: 0,
    scale: 0.4,
    weekly: 1_500,
  },
  {
    id: 'karim',
    name: 'Karim',
    who: '24 · delivery driver · Sétif',
    situation: 'Salaried, and paying off his phone in installments.',
    startCash: 3_000,
    startJar: 2_000,
    scale: 0.75,
    weekly: 4_000,
    aheadNote: 'Phone installments 5–8: 7,500 DA a month',
  },
]

export function characterById(id: string): Character | undefined {
  return CHARACTERS.find((c) => c.id === id)
}

interface Income {
  week: number
  label: string
  amount: number
}
interface BaseBill {
  label: string
  amount: number
  dueWeek: number
}

/** The month's fixed shape for a character — income chunks and base bills.
 *  Draws from the seed for the freelancer's chunks and the electricity bill. */
function monthPlan(c: Character, s: GameState): { incomes: Income[]; bills: BaseBill[] } {
  const electricity = (lo: number, hi: number) => round100(lo + rand(s) * (hi - lo))
  switch (c.id) {
    case 'samira':
      return {
        incomes: [{ week: 1, label: 'Salary', amount: 60_000 }],
        bills: [
          { label: 'Rent', amount: 18_000, dueWeek: 1 },
          { label: 'Phone top-up', amount: 1_000, dueWeek: 1 },
          { label: 'Internet', amount: 2_500, dueWeek: 2 },
          { label: 'Electricity', amount: electricity(2_800, 5_200), dueWeek: 3 },
        ],
      }
    case 'yacine': {
      // Three uneven chunks of ~64,000; the middle one lands in week 2 or 3.
      const total = 64_000
      const a = round100(total * (0.15 + rand(s) * 0.35))
      const b = round100((total - a) * (0.25 + rand(s) * 0.5))
      const midWeek = rand(s) < 0.5 ? 2 : 3
      return {
        incomes: [
          { week: 1, label: 'Client payment', amount: a },
          { week: midWeek, label: 'Client payment', amount: b },
          { week: 4, label: 'Client payment', amount: total - a - b },
        ],
        bills: [
          { label: 'Internet', amount: 3_000, dueWeek: 1 },
          { label: 'Rent (shared flat)', amount: 15_000, dueWeek: 2 },
          { label: 'Phone top-up', amount: 1_000, dueWeek: 2 },
          { label: 'Electricity', amount: electricity(2_000, 4_500), dueWeek: 3 },
        ],
      }
    }
    case 'lina':
      return {
        incomes: [
          { week: 1, label: 'Family allowance', amount: 12_000 },
          { week: 2, label: 'Café shifts', amount: 4_000 },
          { week: 4, label: 'Café shifts', amount: 4_000 },
        ],
        bills: [
          { label: 'Phone top-up', amount: 1_000, dueWeek: 1 },
          { label: 'Transport pass', amount: 1_500, dueWeek: 1 },
          { label: 'Internet share', amount: 1_000, dueWeek: 3 },
        ],
      }
    case 'karim':
      return {
        incomes: [{ week: 1, label: 'Salary', amount: 45_000 }],
        bills: [
          { label: 'Rent', amount: 12_000, dueWeek: 1 },
          { label: 'Phone installment (4 of 8)', amount: 7_500, dueWeek: 2 },
          { label: 'Internet', amount: 2_000, dueWeek: 2 },
          { label: 'Electricity', amount: electricity(2_200, 4_400), dueWeek: 3 },
        ],
      }
  }
}

/* ------------------------------- events ------------------------------ */

export type Tag =
  | 'used-jar'
  | 'saved'
  | 'lent'
  | 'said-no-kindly'
  | 'gave-family'
  | 'planned-giving'
  | 'impulse'
  | 'waited'
  | 'scam-lost'
  | 'scam-avoided'
  | 'installment'
  | 'true-cost'
  | 'deferred'
  | 'kept-sub'
  | 'cancelled-sub'
  | 'side-income'
  | 'rested'
  | 'jamiyya'
  | 'prices'

export interface Effect {
  cash?: number
  /** Negative = spent from the jar (any shortfall falls to cash). */
  jar?: number
  owed?: number
  owedToMe?: number
  /** Not scaled: warmth is 0–100 for everyone. */
  warmth?: number
  /** Pay back as much of `owed` as cash allows, after the rest applies. */
  payOwed?: boolean
}

/** Money formatter handed to text templates: scales a base amount for the
 *  character, rounds to 100 and formats it ("4,500 DA"). */
export type Money = (base: number) => string

export interface LaterSpec {
  /** Lands this many weeks after the choice (min 1)… */
  inWeeks?: number
  /** …or in this absolute week. Past week 4 it becomes "next month". */
  atWeek?: number
  kind: 'bill' | 'cash' | 'repay' | 'note'
  text: (m: Money) => string
  /** For kind 'bill'. */
  bill?: { label: string; amount: number }
  effect?: Effect
  /** Probability it happens (seeded at landing); otherwise missText/missEffect. */
  chance?: number
  missText?: (m: Money) => string
  missEffect?: Effect
}

export interface Choice {
  id: string
  label: (m: Money) => string
  result: (m: Money) => string
  effect: Effect
  tags?: Tag[]
  later?: LaterSpec[]
}

export interface GameEvent {
  id: string
  title: string
  story: (m: Money) => string
  choices: Choice[]
  /** Weeks it may be drawn in (default all). */
  weeks?: number[]
  /** At most one event per group per month (keeps Eid and Ramadan apart). */
  group?: string
}

/** Speaker installment, derived with the simulator's own amortization helper:
 *  24,000 DA cash price over 12 months at a 40% yearly markup. */
const SPEAKER_PRICE = 24_000
const SPEAKER_MONTHLY = round100(installment(SPEAKER_PRICE, 12, 0.4))

export const EVENTS: ReadonlyArray<GameEvent> = [
  {
    id: 'eid-mahba',
    title: 'Eid mahba',
    group: 'season',
    story: () =>
      'Eid is almost here and the little cousins will line up for their mahba. Everyone remembers who gave what — kindly, but they remember.',
    choices: [
      {
        id: 'eid-mahba:generous',
        label: (m) => `Give every child a crisp note — ${m(6000)}`,
        result: () => 'The kids lit up. Your wallet is lighter, and the afternoon was loud and happy.',
        effect: { cash: -6000, warmth: 12 },
        tags: ['gave-family'],
      },
      {
        id: 'eid-mahba:fixed',
        label: (m) => `Decide one amount per child in advance — ${m(3000)} total`,
        result: () => 'Same envelope for everyone, decided ahead. Nobody counted; everyone smiled.',
        effect: { cash: -3000, warmth: 8 },
        tags: ['planned-giving'],
      },
      {
        id: 'eid-mahba:jar',
        label: (m) => `Give generously from the jar — ${m(6000)}`,
        result: () => 'The jar paid for the joy. Cash for the rest of the month stays put.',
        effect: { jar: -6000, warmth: 12 },
        tags: ['gave-family', 'used-jar'],
      },
    ],
  },
  {
    id: 'cousin-wedding',
    title: "Your cousin's wedding",
    story: () =>
      "Your cousin Nesrine is getting married. The family expects a contribution — and you'll want to be at every evening.",
    choices: [
      {
        id: 'cousin-wedding:full',
        label: (m) => `Contribute ${m(10000)}`,
        result: () => 'A proper gift, a proper party. The month feels shorter now, but the photos are lovely.',
        effect: { cash: -10000, warmth: 12 },
        tags: ['gave-family'],
      },
      {
        id: 'cousin-wedding:help',
        label: (m) => `Give ${m(5000)} and help set up the hall`,
        result: () => 'You gave what fit and carried chairs until midnight. Your aunt noticed both.',
        effect: { cash: -5000, warmth: 10 },
        tags: ['planned-giving'],
      },
      {
        id: 'cousin-wedding:jar',
        label: (m) => `Contribute ${m(10000)} from the jar`,
        result: () => 'The jar covered the gift. It will want refilling, and that is what jars are for.',
        effect: { jar: -10000, warmth: 12 },
        tags: ['gave-family', 'used-jar'],
      },
    ],
  },
  {
    id: 'cracked-screen',
    title: 'Cracked screen',
    story: () =>
      'Your phone slipped off the café table. The screen is spiderwebbed, but it still works — mostly.',
    choices: [
      {
        id: 'cracked-screen:fix',
        label: (m) => `Repair it at the shop you trust — ${m(4500)}`,
        result: () => 'Good as new by the afternoon. One less thing nagging at you.',
        effect: { cash: -4500, warmth: 1 },
      },
      {
        id: 'cracked-screen:jar',
        label: (m) => `Repair it from the jar — ${m(4500)}`,
        result: () => 'Exactly the kind of surprise the jar is for. Fixed, and cash untouched.',
        effect: { jar: -4500, warmth: 1 },
        tags: ['used-jar'],
      },
      {
        id: 'cracked-screen:wait',
        label: () => 'Live with the crack for now',
        result: () => 'You squint a little more. The money stays — for now.',
        effect: { warmth: -4 },
        tags: ['deferred'],
        later: [
          {
            inWeeks: 2,
            kind: 'bill',
            bill: { label: 'Screen repair (crack spread)', amount: 6500 },
            text: (m) => `The crack spread into the touch layer. The repair is now ${m(6500)} — it joined your bills.`,
          },
        ],
      },
    ],
  },
  {
    id: 'friend-borrow',
    title: 'A friend asks to borrow',
    story: (m) =>
      `Amine messages late: he's short this week and asks for ${m(5000)} until "next week, wallah."`,
    choices: [
      {
        id: 'friend-borrow:full',
        label: (m) => `Lend the full ${m(5000)}`,
        result: () => 'He sent three heart emojis. Now it is out of your hands.',
        effect: { cash: -5000, owedToMe: 5000, warmth: 6 },
        tags: ['lent'],
        later: [
          {
            atWeek: 4,
            kind: 'repay',
            chance: 0.6,
            effect: { cash: 5000, owedToMe: -5000 },
            text: (m) => `Amine paid back ${m(5000)}, with a box of cakes.`,
            missText: (m) => `Amine hasn't paid back yet — he says next month. ${m(5000)} is still out.`,
          },
        ],
      },
      {
        id: 'friend-borrow:part',
        label: (m) => `Lend ${m(2000)} — what you could live without`,
        result: () => 'Not everything he asked, but real help. He understood.',
        effect: { cash: -2000, owedToMe: 2000, warmth: 5 },
        tags: ['lent'],
        later: [
          {
            atWeek: 4,
            kind: 'repay',
            chance: 0.75,
            effect: { cash: 2000, owedToMe: -2000 },
            text: (m) => `Amine paid back ${m(2000)}.`,
            missText: (m) => `Amine hasn't paid back the ${m(2000)} yet. It was money you could live without.`,
          },
        ],
      },
      {
        id: 'friend-borrow:no',
        label: () => 'Say no kindly, and send him a gig lead instead',
        result: () => 'He was quiet for a minute, then thanked you for the lead. Friendship intact.',
        effect: { warmth: -2 },
        tags: ['said-no-kindly'],
      },
    ],
  },
  {
    id: 'flash-sale',
    title: 'Flash sale',
    story: (m) =>
      `A marketplace page shows the sneakers you liked at 50% off — ${m(7000)}, "tonight only".`,
    choices: [
      {
        id: 'flash-sale:buy',
        label: (m) => `Buy them now — ${m(7000)}`,
        result: () => 'They are comfy. The "tonight only" timer quietly reset the next morning.',
        effect: { cash: -7000, warmth: 4 },
        tags: ['impulse'],
      },
      {
        id: 'flash-sale:wait',
        label: () => 'Wait 48 hours and see if you still want them',
        result: () => 'Two days later the want had faded. The same "sale" was still running.',
        effect: {},
        tags: ['waited'],
      },
      {
        id: 'flash-sale:jar',
        label: (m) => `Skip it and put ${m(2000)} in the jar`,
        result: () => 'The jar grew a little. Future you says thanks.',
        effect: { cash: -2000, jar: 2000, warmth: 1 },
        tags: ['saved'],
      },
    ],
  },
  {
    id: 'sure-thing',
    title: 'A "sure thing"',
    story: (m) =>
      `A friend of a friend in a Telegram group promises your money doubled in 30 days. "Spots are limited — send ${m(10000)} today."`,
    choices: [
      {
        id: 'sure-thing:send',
        label: (m) => `Send ${m(10000)}`,
        result: () => 'They thanked you fast and promised updates. You hope it works out.',
        effect: { cash: -10000, warmth: 2 },
        tags: ['scam-lost'],
        later: [
          {
            inWeeks: 2,
            kind: 'note',
            effect: { warmth: -6 },
            text: (m) =>
              `The Telegram group went silent. The ${m(10000)} isn't coming back — it was never an investment.`,
          },
        ],
      },
      {
        id: 'sure-thing:ask',
        label: () => 'Ask who licenses it, then pass',
        result: () => 'Nobody could name a licence. You kept your money and your calm.',
        effect: { warmth: 1 },
        tags: ['scam-avoided'],
      },
      {
        id: 'sure-thing:warn',
        label: () => 'Pass, and warn the family WhatsApp group',
        result: () => 'Your uncle had almost sent money. He sent you a heart instead.',
        effect: { warmth: 4 },
        tags: ['scam-avoided'],
      },
    ],
  },
  {
    id: 'electricity-high',
    title: 'Electricity came in high',
    story: (m) => `The Sonelgaz bill is ${m(3000)} higher than usual — the heater worked hard this quarter.`,
    choices: [
      {
        id: 'electricity-high:pay',
        label: (m) => `Pay the extra now — ${m(3000)}`,
        result: () => 'Paid and done. Maybe a blanket before the heater next time.',
        effect: { cash: -3000 },
      },
      {
        id: 'electricity-high:jar',
        label: (m) => `Pay the extra from the jar — ${m(3000)}`,
        result: () => 'The jar smoothed out a lumpy bill. Cash for the week stays steady.',
        effect: { jar: -3000 },
        tags: ['used-jar'],
      },
      {
        id: 'electricity-high:plan',
        label: () => 'Ask the agency for a payment arrangement',
        result: () => 'They agreed to next week. Breathing room, with a date on it.',
        effect: { warmth: -1 },
        tags: ['deferred'],
        later: [
          {
            inWeeks: 1,
            kind: 'bill',
            bill: { label: 'Electricity arrangement', amount: 3000 },
            text: (m) => `The arranged electricity payment of ${m(3000)} is due this week.`,
          },
        ],
      },
    ],
  },
  {
    id: 'jamiyya-turn',
    title: "Your jam'iyya turn",
    weeks: [2, 3, 4],
    story: (m) =>
      `It's your turn in the family jam'iyya: ${m(20000)} lands in your hands after months of chipping in.`,
    choices: [
      {
        id: 'jamiyya-turn:half',
        label: () => 'Put half in the jar, keep half as cash',
        result: () => 'Months of small contributions just became a real cushion.',
        effect: { cash: 10000, jar: 10000, warmth: 3 },
        tags: ['saved', 'jamiyya'],
      },
      {
        id: 'jamiyya-turn:keep',
        label: () => 'Keep it all as cash for the month',
        result: () => 'The month suddenly feels roomy. Roomy months spend fast, so it goes.',
        effect: { cash: 20000, warmth: 3 },
        tags: ['jamiyya'],
      },
      {
        id: 'jamiyya-turn:repay',
        label: () => 'Pay back anything you owe first, keep the rest',
        result: () => 'Clean slate first, then the rest. It feels light.',
        effect: { cash: 20000, warmth: 4, payOwed: true },
        tags: ['jamiyya'],
      },
    ],
  },
  {
    id: 'jamiyya-due',
    title: "Jam'iyya contribution",
    story: (m) =>
      `This round's jam'iyya contribution is due: ${m(5000)}. The group counts on everyone paying on time.`,
    choices: [
      {
        id: 'jamiyya-due:pay',
        label: (m) => `Pay your share — ${m(5000)}`,
        result: () => 'On time, like always. Your turn to collect gets a little closer.',
        effect: { cash: -5000, warmth: 3 },
        tags: ['jamiyya'],
      },
      {
        id: 'jamiyya-due:jar',
        label: (m) => `Pay it from the jar — ${m(5000)}`,
        result: () => 'Paid on time; the jar moved the money from one saving to another.',
        effect: { jar: -5000, warmth: 3 },
        tags: ['jamiyya', 'used-jar'],
      },
      {
        id: 'jamiyya-due:late',
        label: () => 'Ask the organiser for one more week',
        result: () => 'Your aunt sighed but agreed. Next week it is.',
        effect: { warmth: -3 },
        tags: ['jamiyya', 'deferred'],
        later: [
          {
            inWeeks: 1,
            kind: 'bill',
            bill: { label: "Jam'iyya contribution", amount: 5000 },
            text: (m) => `The jam'iyya contribution of ${m(5000)} you moved is due this week.`,
          },
        ],
      },
    ],
  },
  {
    id: 'weekend-gig',
    title: 'A weekend gig',
    story: (m) =>
      `A neighbour needs help with stock-taking at his shop this weekend. ${m(6000)}, paid next week.`,
    choices: [
      {
        id: 'weekend-gig:take',
        label: (m) => `Take both days — ${m(6000)} next week`,
        result: () => 'Two long days of counting boxes. Tired, but it adds up.',
        effect: { warmth: -3 },
        tags: ['side-income'],
        later: [
          {
            inWeeks: 1,
            kind: 'cash',
            effect: { cash: 6000 },
            text: (m) => `The weekend gig paid ${m(6000)}.`,
          },
        ],
      },
      {
        id: 'weekend-gig:half',
        label: (m) => `Take one day — ${m(3000)} next week`,
        result: () => 'One day of work, one day of rest. A fair split.',
        effect: { warmth: -1 },
        tags: ['side-income'],
        later: [
          {
            inWeeks: 1,
            kind: 'cash',
            effect: { cash: 3000 },
            text: (m) => `The one-day gig paid ${m(3000)}.`,
          },
        ],
      },
      {
        id: 'weekend-gig:rest',
        label: () => 'Rest this weekend',
        result: () => 'You slept in and saw friends. Rest is not nothing.',
        effect: { warmth: 5 },
        tags: ['rested'],
      },
    ],
  },
  {
    id: 'fever',
    title: 'A fever',
    story: (m) =>
      `A fever knocks you flat. A doctor's visit and the pharmacy would come to about ${m(3500)}.`,
    choices: [
      {
        id: 'fever:go',
        label: (m) => `See the doctor now — ${m(3500)}`,
        result: () => 'Antibiotics, soup, and two days in bed. You are on the mend.',
        effect: { cash: -3500, warmth: 2 },
      },
      {
        id: 'fever:jar',
        label: (m) => `See the doctor, paid from the jar — ${m(3500)}`,
        result: () => 'Health first, and the jar made it easy to say yes.',
        effect: { jar: -3500, warmth: 2 },
        tags: ['used-jar'],
      },
      {
        id: 'fever:wait',
        label: () => 'Rest and wait it out',
        result: () => 'Tea, blankets, and hoping it passes.',
        effect: { warmth: -6 },
        tags: ['deferred'],
        later: [
          {
            inWeeks: 1,
            kind: 'bill',
            bill: { label: 'Doctor and pharmacy', amount: 5000 },
            text: (m) => `The fever hung on. The doctor and pharmacy came to ${m(5000)} this week.`,
          },
        ],
      },
    ],
  },
  {
    id: 'bus-strike',
    title: 'Bus strike',
    story: (m) => `The buses are on strike. Taxis would add about ${m(2500)} to this week.`,
    choices: [
      {
        id: 'bus-strike:taxi',
        label: (m) => `Take taxis — ${m(2500)}`,
        result: () => 'On time every day, and the driver had opinions about football.',
        effect: { cash: -2500 },
        tags: ['prices'],
      },
      {
        id: 'bus-strike:share',
        label: (m) => `Share a clando with two colleagues — ${m(1000)}`,
        result: () => 'Squeezed in the back seat, but laughing. Cheaper and friendlier.',
        effect: { cash: -1000, warmth: 3 },
        tags: ['prices'],
      },
      {
        id: 'bus-strike:walk',
        label: (m) => `Walk, and work from home where you can — ${m(300)} for snacks`,
        result: () => 'Sore feet, a few missed coffees. The money stayed.',
        effect: { cash: -300, warmth: -3 },
        tags: ['prices'],
      },
    ],
  },
  {
    id: 'staples-up',
    title: 'Prices went up',
    story: (m) =>
      `Oil, semolina and milk all crept up at the hanout. The weekly shop is ${m(3000)} more than last month.`,
    choices: [
      {
        id: 'staples-up:pay',
        label: (m) => `Pay the difference — ${m(3000)}`,
        result: () => 'Same basket, bigger number. That is what inflation feels like up close.',
        effect: { cash: -3000 },
        tags: ['prices'],
      },
      {
        id: 'staples-up:bulk',
        label: (m) => `Buy in bulk with your sister — ${m(4000)} now`,
        result: () => 'The cupboard is full. It should stretch.',
        effect: { cash: -4000, warmth: 2 },
        tags: ['prices'],
        later: [
          {
            inWeeks: 2,
            kind: 'cash',
            effect: { cash: 2500 },
            text: (m) => `The bulk shop stretched: you spent ${m(2500)} less on groceries this week.`,
          },
        ],
      },
      {
        id: 'staples-up:trim',
        label: (m) => `Trim the extras off the list — ${m(1000)}`,
        result: () => 'No biscuits this week. The basics are covered.',
        effect: { cash: -1000, warmth: -3 },
        tags: ['prices'],
      },
    ],
  },
  {
    id: 'ramadan-ftour',
    title: 'Ramadan ftour',
    group: 'season',
    story: (m) =>
      `It's your turn to host the family ftour. A full table — chorba, bourek, dessert — would be about ${m(8000)}.`,
    choices: [
      {
        id: 'ramadan-ftour:host',
        label: (m) => `Host the full table — ${m(8000)}`,
        result: () => 'Everyone stayed until suhoor. The kitchen is a mess; your heart is full.',
        effect: { cash: -8000, warmth: 12 },
        tags: ['gave-family'],
      },
      {
        id: 'ramadan-ftour:potluck',
        label: (m) => `Host, and ask everyone to bring a dish — ${m(3500)}`,
        result: () => 'The table was even fuller. Nobody minded bringing something.',
        effect: { cash: -3500, warmth: 10 },
        tags: ['planned-giving'],
      },
      {
        id: 'ramadan-ftour:jar',
        label: (m) => `Host the full table from the jar — ${m(8000)}`,
        result: () => 'A generous table and a lighter jar. The month itself is untouched.',
        effect: { jar: -8000, warmth: 12 },
        tags: ['gave-family', 'used-jar'],
      },
    ],
  },
  {
    id: 'rentree',
    title: 'La rentrée',
    story: (m) =>
      `Your little brother starts school next week: tablier, cartable, books — about ${m(6000)}.`,
    choices: [
      {
        id: 'rentree:all',
        label: (m) => `Cover all of it — ${m(6000)}`,
        result: () => 'He wore the new tablier around the house all evening.',
        effect: { cash: -6000, warmth: 10 },
        tags: ['gave-family'],
      },
      {
        id: 'rentree:split',
        label: (m) => `Split it with your parents — ${m(3000)}`,
        result: () => 'Half each, agreed over coffee. Everyone carried a piece.',
        effect: { cash: -3000, warmth: 8 },
        tags: ['planned-giving'],
      },
      {
        id: 'rentree:list',
        label: (m) => `Cover the list with secondhand books — ${m(3500)}`,
        result: () => "A neighbour's old books, a new cartable. He didn't notice the difference.",
        effect: { cash: -3500, warmth: 7 },
        tags: ['planned-giving'],
      },
    ],
  },
  {
    id: 'free-trial',
    title: 'Free trial ending',
    story: (m) => `The streaming free trial converts tomorrow: ${m(1500)} a month, every month.`,
    choices: [
      {
        id: 'free-trial:cancel',
        label: () => 'Cancel it today',
        result: () => 'Two taps and it is gone. The series will wait.',
        effect: { warmth: -1 },
        tags: ['cancelled-sub'],
      },
      {
        id: 'free-trial:keep',
        label: (m) => `Keep it — ${m(1500)} a month`,
        result: () => 'Cosy evenings ahead. It will quietly renew each month.',
        effect: { cash: -1500, warmth: 3 },
        tags: ['kept-sub'],
        later: [
          {
            inWeeks: 4,
            kind: 'bill',
            bill: { label: 'Streaming subscription', amount: 1500 },
            text: (m) => `The streaming subscription renews: ${m(1500)}.`,
          },
        ],
      },
    ],
  },
  {
    id: 'installment-offer',
    title: '"Only a little a month"',
    story: (m) =>
      `A shop offers a speaker on installment: "only ${m(SPEAKER_MONTHLY)} a month!" for 12 months. The cash price is ${m(SPEAKER_PRICE)}.`,
    choices: [
      {
        id: 'installment-offer:sign',
        label: () => 'Sign up — it is only a little a month',
        result: () => 'The speaker sounds great. The first installment comes next week.',
        effect: { warmth: 5 },
        tags: ['installment'],
        later: [
          {
            inWeeks: 1,
            kind: 'bill',
            bill: { label: 'Speaker installment 1 of 12', amount: SPEAKER_MONTHLY },
            text: (m) => `Speaker installment 1 of 12 is due: ${m(SPEAKER_MONTHLY)}.`,
          },
          {
            inWeeks: 5,
            kind: 'note',
            text: (m) =>
              `Speaker installments 2–12: ${m(SPEAKER_MONTHLY)} a month, about ${m(SPEAKER_MONTHLY * 12)} in total.`,
          },
        ],
      },
      {
        id: 'installment-offer:math',
        label: (m) => `Do the math — ${m(SPEAKER_MONTHLY * 12)} in total — and pass`,
        result: (m) => `${m(SPEAKER_MONTHLY * 12)} for a ${m(SPEAKER_PRICE)} speaker. You passed, and felt clever.`,
        effect: {},
        tags: ['true-cost'],
      },
      {
        id: 'installment-offer:jar',
        label: (m) => `Start a speaker jar with ${m(SPEAKER_MONTHLY)} instead`,
        result: () => 'Same monthly amount, no markup — and the speaker is yours when the jar says so.',
        effect: { cash: -SPEAKER_MONTHLY, jar: SPEAKER_MONTHLY },
        tags: ['saved', 'true-cost'],
      },
    ],
  },
  {
    id: 'lost-wallet',
    title: 'Lost wallet',
    story: (m) => `Your wallet is gone — ${m(3000)} in cash and your ID card with it.`,
    choices: [
      {
        id: 'lost-wallet:redo',
        label: (m) => `Report it and redo your papers — ${m(800)} in fees`,
        result: () => 'The queue at the daïra was long, but your new ID is on its way.',
        effect: { cash: -3800, warmth: -2 },
      },
      {
        id: 'lost-wallet:post',
        label: () => 'Post in the neighbourhood Facebook group first',
        result: () => 'Lots of shares and kind comments. Now you wait.',
        effect: { cash: -3000 },
        later: [
          {
            inWeeks: 1,
            kind: 'cash',
            chance: 0.5,
            effect: { cash: 3000, warmth: 6 },
            text: (m) => `Someone dropped your wallet at the mosque — the ${m(3000)} still inside.`,
            missText: (m) => `No word on the wallet. You redid your papers anyway — ${m(800)} in fees.`,
            missEffect: { cash: -800 },
          },
        ],
      },
      {
        id: 'lost-wallet:jar',
        label: (m) => `Refill your pocket from the jar and redo your papers — ${m(3800)}`,
        result: () => 'An annoying day, but the jar meant this week carried on as planned.',
        effect: { jar: -3800, warmth: -1 },
        tags: ['used-jar'],
      },
    ],
  },
  {
    id: 'small-win',
    title: 'A small win',
    story: (m) => `A happy client — or your boss — hands you a ${m(5000)} thank-you prime.`,
    choices: [
      {
        id: 'small-win:jar',
        label: () => 'Put all of it in the jar',
        result: () => 'Straight into the jar, before it could become anything else.',
        effect: { jar: 5000, warmth: 2 },
        tags: ['saved'],
      },
      {
        id: 'small-win:treat',
        label: (m) => `Treat your friends to dinner — ${m(3500)} of it`,
        result: () => 'Grilled fish by the sea and a lot of laughing. Worth it.',
        effect: { cash: 1500, warmth: 10 },
      },
      {
        id: 'small-win:split',
        label: () => 'Half in the jar, half to enjoy',
        result: () => 'A little cushion, a little joy. Both count.',
        effect: { cash: 2500, jar: 2500, warmth: 5 },
        tags: ['saved'],
      },
    ],
  },
  {
    id: 'mama-bill',
    title: "Mama's gas bill",
    story: (m) => `Your mother mentions, quietly, that the gas bill at home is ${m(4000)} this month.`,
    choices: [
      {
        id: 'mama-bill:all',
        label: (m) => `Pay all of it — ${m(4000)}`,
        result: () => 'She protested twice and then hugged you. It was the right kind of money.',
        effect: { cash: -4000, warmth: 10 },
        tags: ['gave-family'],
      },
      {
        id: 'mama-bill:half',
        label: (m) => `Cover half and say when you can do more — ${m(2000)}`,
        result: () => 'Honest and kind. She knows exactly what to expect from you.',
        effect: { cash: -2000, warmth: 8 },
        tags: ['planned-giving'],
      },
      {
        id: 'mama-bill:plan',
        label: (m) => `Set up a small monthly share with your siblings — ${m(1500)}`,
        result: () => 'A sibling group chat, a fixed amount each. Nobody carries it alone now.',
        effect: { cash: -1500, warmth: 7 },
        tags: ['planned-giving'],
      },
    ],
  },
]

const EVENT_BY_ID = new Map(EVENTS.map((e) => [e.id, e]))
const CHOICE_BY_ID = new Map(EVENTS.flatMap((e) => e.choices.map((c) => [c.id, { event: e, choice: c }] as const)))

export function eventById(id: string): GameEvent | undefined {
  return EVENT_BY_ID.get(id)
}

/* -------------------------------- state ------------------------------ */

export const WEEKS = 4

export interface BillState {
  id: string
  label: string
  amount: number
  dueWeek: number
  paid: boolean
  paidWeek: number | null
}

export interface Pending {
  id: string
  week: number
  kind: LaterSpec['kind']
  text: string
  missText: string | null
  chance: number | null
  effect: Effect
  missEffect: Effect
  bill: { label: string; amount: number } | null
  sourceEventId: string
}

export interface Notice {
  kind: 'income' | 'bill' | 'catch-up' | 'landed' | 'missed' | 'iou' | 'caught-up'
  text: string
}

export interface LogEntry {
  week: number
  eventId: string
  choiceId: string
  tags: Tag[]
}

export interface Outcome {
  eventId: string
  choiceId: string
  text: string
  notes: string[]
}

export interface GameState {
  v: 1
  characterId: CharacterId
  seed: number
  rng: number
  /** 1–4 while playing; 5 once the month has closed. */
  week: number
  cash: number
  jar: number
  owed: number
  owedToMe: number
  warmth: number
  bills: BillState[]
  incomes: Income[]
  pending: Pending[]
  /** Things that land next month (installments, renewals, loans still out). */
  ahead: string[]
  queue: string[]
  eventIdx: number
  used: string[]
  groupsUsed: string[]
  log: LogEntry[]
  /** Notices from the start of the current week (or the month's close). */
  notices: Notice[]
  lastOutcome: Outcome | null
  /** Outcome flags of delayed effects, e.g. 'repaid', 'not-repaid', 'iou'. */
  flags: string[]
}

const START_WARMTH = 60

function moneyFor(c: Character): Money {
  return (base) => fmtDA(round100(base * c.scale))
}

function scaleEffect(e: Effect, scale: number): Effect {
  const sc = (n: number | undefined) => (n === undefined ? undefined : round100(n * scale))
  return {
    cash: sc(e.cash),
    jar: sc(e.jar),
    owed: sc(e.owed),
    owedToMe: sc(e.owedToMe),
    warmth: e.warmth,
    payOwed: e.payOwed,
  }
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T

function charOf(s: GameState): Character {
  const c = characterById(s.characterId)
  if (!c) throw new Error(`unknown character ${s.characterId}`)
  return c
}

/** Apply an (already scaled) effect. Never lets cash or jar go negative:
 *  a jar shortfall falls to cash, a cash shortfall becomes a small family
 *  IOU. Returns plain-language notes about any of that. */
function applyEffect(s: GameState, e: Effect): string[] {
  const notes: string[] = []
  s.cash += e.cash ?? 0
  s.jar += e.jar ?? 0
  s.owed += e.owed ?? 0
  s.owedToMe = Math.max(0, s.owedToMe + (e.owedToMe ?? 0))
  s.warmth = clamp(s.warmth + (e.warmth ?? 0), 0, 100)
  if (s.jar < 0) {
    notes.push(`The jar was ${fmtDA(-s.jar)} short, so cash covered the rest.`)
    s.cash += s.jar
    s.jar = 0
  }
  if (s.cash < 0) {
    notes.push(`Cash ran dry — your sister covered ${fmtDA(-s.cash)} as a small IOU.`)
    s.owed += -s.cash
    s.cash = 0
    if (!s.flags.includes('iou')) s.flags.push('iou')
  }
  if (e.payOwed && s.owed > 0) {
    const pay = Math.min(s.owed, s.cash)
    if (pay > 0) {
      s.owed -= pay
      s.cash -= pay
      notes.push(`You paid back ${fmtDA(pay)} you owed.`)
    }
  }
  return notes
}

/** Pay every due, unpaid bill that cash covers, oldest first. */
function payBills(s: GameState, upTo: number, notices: Notice[]): void {
  for (const b of s.bills) {
    if (b.paid || b.dueWeek > upTo) continue
    if (s.cash >= b.amount) {
      s.cash -= b.amount
      b.paid = true
      b.paidWeek = s.week
      notices.push({
        kind: b.dueWeek < s.week ? 'caught-up' : 'bill',
        text:
          b.dueWeek < s.week
            ? `Caught up: ${b.label} (${fmtDA(b.amount)}) is paid.`
            : `${b.label}: ${fmtDA(b.amount)} paid.`,
      })
    } else if (b.dueWeek === s.week) {
      notices.push({
        kind: 'catch-up',
        text: `${b.label} (${fmtDA(b.amount)}) waits for now — it rolls into catch-up.`,
      })
    }
  }
}

function landPending(s: GameState, notices: Notice[]): void {
  const landing = s.pending.filter((p) => p.week === s.week)
  s.pending = s.pending.filter((p) => p.week !== s.week)
  for (const p of landing) {
    const hit = p.chance === null || rand(s) < p.chance
    if (p.kind === 'repay') s.flags.push(hit ? 'repaid' : 'not-repaid')
    if (p.kind === 'bill' && p.bill) {
      s.bills.push({
        id: `${p.id}-bill`,
        label: p.bill.label,
        amount: p.bill.amount,
        dueWeek: s.week,
        paid: false,
        paidWeek: null,
      })
    }
    const notes = applyEffect(s, hit ? p.effect : p.missEffect)
    notices.push({ kind: hit ? 'landed' : 'missed', text: hit ? p.text : (p.missText ?? p.text) })
    for (const n of notes) notices.push({ kind: 'iou', text: n })
  }
}

function drawEvents(s: GameState): string[] {
  const count = rand(s) < 0.5 ? 1 : 2
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const pool = EVENTS.filter(
      (e) =>
        !s.used.includes(e.id) &&
        !out.includes(e.id) &&
        (!e.weeks || e.weeks.includes(s.week)) &&
        (!e.group || !s.groupsUsed.includes(e.group)),
    )
    if (pool.length === 0) break
    const pick = pool[Math.floor(rand(s) * pool.length)]
    out.push(pick.id)
    s.used.push(pick.id)
    if (pick.group) s.groupsUsed.push(pick.group)
  }
  return out
}

/** Start week `s.week`: income, delayed effects, bills, then this week's events. */
function startWeek(s: GameState): void {
  const notices: Notice[] = []
  for (const inc of s.incomes.filter((i) => i.week === s.week)) {
    s.cash += inc.amount
    notices.push({ kind: 'income', text: `${inc.label}: ${fmtDA(inc.amount)} arrived.` })
  }
  landPending(s, notices)
  const living = charOf(s).weekly
  notices.push({ kind: 'bill', text: `Groceries and transport: ${fmtDA(living)}.` })
  for (const n of applyEffect(s, { cash: -living })) notices.push({ kind: 'iou', text: n })
  payBills(s, s.week, notices)
  s.notices = notices
  s.queue = drawEvents(s)
  s.eventIdx = 0
}

/** How a delayed effect that missed this month reads on next month's list. */
function aheadText(p: Pending): string {
  if (p.kind === 'bill' && p.bill) return `${p.bill.label} — ${fmtDA(p.bill.amount)}`
  if (p.kind === 'cash' && p.effect.cash) {
    const title = EVENT_BY_ID.get(p.sourceEventId)?.title ?? 'earlier'
    return `${fmtDA(p.effect.cash)} expected from ${title.toLowerCase()}`
  }
  return p.text
}

/** Close the month: one last catch-up pass, then list what lands next month. */
function closeMonth(s: GameState): void {
  s.week = WEEKS + 1
  const notices: Notice[] = []
  payBills(s, WEEKS, notices)
  for (const p of s.pending) if (p.kind !== 'repay') s.ahead.push(aheadText(p))
  s.pending = []
  if (s.owedToMe > 0) s.ahead.push(`${fmtDA(s.owedToMe)} you lent is still out — maybe next month.`)
  if (s.owed > 0) s.ahead.push(`${fmtDA(s.owed)} to pay back to family.`)
  s.notices = notices
  s.queue = []
  s.eventIdx = 0
}

/* -------------------------------- API -------------------------------- */

export function newGame(characterId: CharacterId, seed: number): GameState {
  const c = characterById(characterId)
  if (!c) throw new Error(`unknown character ${characterId}`)
  const s: GameState = {
    v: 1,
    characterId,
    seed: seed >>> 0,
    rng: seed >>> 0,
    week: 1,
    cash: c.startCash,
    jar: c.startJar,
    owed: 0,
    owedToMe: 0,
    warmth: START_WARMTH,
    bills: [],
    incomes: [],
    pending: [],
    ahead: c.aheadNote ? [c.aheadNote] : [],
    queue: [],
    eventIdx: 0,
    used: [],
    groupsUsed: [],
    log: [],
    notices: [],
    lastOutcome: null,
    flags: [],
  }
  const plan = monthPlan(c, s)
  s.incomes = plan.incomes
  s.bills = plan.bills.map((b, i) => ({ id: `base-${i}`, ...b, paid: false, paidWeek: null }))
  startWeek(s)
  return s
}

export function isOver(s: GameState): boolean {
  return s.week > WEEKS
}

export function currentEvent(s: GameState): { id: string; title: string; story: string } | null {
  if (isOver(s)) return null
  const e = EVENT_BY_ID.get(s.queue[s.eventIdx])
  if (!e) return null
  return { id: e.id, title: e.title, story: e.story(moneyFor(charOf(s))) }
}

export interface ChoiceView {
  id: string
  label: string
  /** Short, explicit effect chips: "cash −4,500 DA", "lands later". */
  hints: string[]
}

function signed(n: number): string {
  return `${n > 0 ? '+' : '−'}${fmtDA(Math.abs(n))}`
}

export function availableChoices(s: GameState): ChoiceView[] {
  if (isOver(s)) return []
  const e = EVENT_BY_ID.get(s.queue[s.eventIdx])
  if (!e) return []
  const c = charOf(s)
  const m = moneyFor(c)
  return e.choices.map((ch) => {
    const fx = scaleEffect(ch.effect, c.scale)
    const hints: string[] = []
    if (fx.cash) hints.push(`cash ${signed(fx.cash)}`)
    if (fx.jar) hints.push(`jar ${signed(fx.jar)}`)
    if (fx.owedToMe) hints.push(`lent ${fmtDA(Math.abs(fx.owedToMe))}`)
    if (fx.warmth) hints.push(fx.warmth > 0 ? 'warmth up' : 'warmth down')
    if (ch.later?.length) hints.push('something lands later')
    return { id: ch.id, label: ch.label(m), hints }
  })
}

export function choose(state: GameState, choiceId: string): GameState {
  if (isOver(state) || weekDone(state)) return state
  const eventId = state.queue[state.eventIdx]
  const found = CHOICE_BY_ID.get(choiceId)
  if (!found || found.event.id !== eventId) return state
  const s = clone(state)
  const c = charOf(s)
  const m = moneyFor(c)
  const { choice } = found
  const notes = applyEffect(s, scaleEffect(choice.effect, c.scale))
  choice.later?.forEach((l, i) => {
    let week = l.atWeek ?? s.week + Math.max(1, l.inWeeks ?? 1)
    if (week <= s.week) week = s.week + 1
    s.pending.push({
      id: `${choiceId}#${s.week}.${i}`,
      week,
      kind: l.kind,
      text: l.text(m),
      missText: l.missText ? l.missText(m) : null,
      chance: l.chance ?? null,
      effect: scaleEffect(l.effect ?? {}, c.scale),
      missEffect: scaleEffect(l.missEffect ?? {}, c.scale),
      bill: l.bill ? { label: l.bill.label, amount: round100(l.bill.amount * c.scale) } : null,
      sourceEventId: eventId,
    })
    if (week > WEEKS) notes.push('This one lands next month.')
  })
  s.log.push({ week: s.week, eventId, choiceId, tags: choice.tags ?? [] })
  s.lastOutcome = { eventId, choiceId, text: choice.result(m), notes }
  s.eventIdx += 1
  s.notices = []
  return s
}

/** True once this week's events are all answered and the week can turn. */
export function weekDone(s: GameState): boolean {
  return !isOver(s) && s.eventIdx >= s.queue.length
}

/** Turn the week: start the next one (income, delayed effects, bills, new
 *  events) or, after week 4, close the month. No-op mid-week. */
export function advance(state: GameState): GameState {
  if (!weekDone(state)) return state
  const s = clone(state)
  s.week += 1
  if (s.week > WEEKS) closeMonth(s)
  else startWeek(s)
  return s
}

/* ------------------------------- summary ----------------------------- */

export interface Lesson {
  nodeId: string
  text: string
}

export interface Summary {
  characterId: CharacterId
  cash: number
  jar: number
  jarDelta: number
  owed: number
  owedToMe: number
  warmth: number
  billsPaid: number
  billsTotal: number
  catchUp: string[]
  ahead: string[]
  title: string
  titleLine: string
  lessons: Lesson[]
}

interface LessonCtx {
  s: GameState
  titles: string[]
  count: number
}

interface LessonRule {
  key: string
  nodeId: string
  applies: (s: GameState) => number
  text: (ctx: LessonCtx) => string
}

const tagCount = (s: GameState, t: Tag) => s.log.filter((l) => l.tags.includes(t)).length
const titlesFor = (s: GameState, t: Tag) =>
  s.log.filter((l) => l.tags.includes(t)).map((l) => EVENT_BY_ID.get(l.eventId)?.title.toLowerCase() ?? l.eventId)
const lower = (xs: string[]) => xs.map((x) => x.replace(/^"|"$/g, ''))
const list = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

/** Ordered by how much the choice shaped the month; the first three distinct
 *  nodes that apply become the summary's lessons. */
const LESSON_RULES: ReadonlyArray<LessonRule> = [
  {
    key: 'scam-lost',
    nodeId: 'g6-after-a-scam',
    applies: (s) => tagCount(s, 'scam-lost'),
    text: () =>
      'The "doubled in 30 days" pitch took real money. It happens to careful people too — what helps is acting fast and telling others, without shame.',
  },
  {
    key: 'lent',
    nodeId: 'f4-lending-to-friends',
    applies: (s) => tagCount(s, 'lent'),
    text: ({ s }) =>
      !s.flags.includes('repaid')
        ? "You lent to a friend and it hasn't come back yet. Lending only what you could live without keeps a late repayment from turning into a crisis."
        : 'You lent to a friend and it came back. Lending what you could live without kept both the friendship and the month calm.',
  },
  {
    key: 'installment',
    nodeId: 'c2-true-cost',
    applies: (s) => tagCount(s, 'installment'),
    text: () =>
      '"Only a little a month" became a bill that follows you into next month. The true cost is the total, not the slice.',
  },
  {
    key: 'iou',
    nodeId: 'c5-owing-to-people',
    applies: (s) => (s.flags.includes('iou') ? 1 : 0),
    text: () =>
      'When cash ran dry, family covered the gap. Owing people is real debt too — naming an amount and a date keeps it kind.',
  },
  {
    key: 'used-jar-often',
    nodeId: 'b6-rebuild-after-use',
    applies: (s) => (tagCount(s, 'used-jar') >= 2 ? 2 : 0),
    text: ({ titles }) =>
      `The jar carried ${list(lower(titles))}. That is the cushion working — the next step is a small, steady refill.`,
  },
  {
    key: 'used-jar',
    nodeId: 'b1-why-a-cushion',
    applies: (s) => tagCount(s, 'used-jar'),
    text: ({ titles }) =>
      `Your jar covered ${list(lower(titles))}, so the rest of the month didn't have to bend. That is exactly what a cushion is for.`,
  },
  {
    key: 'scam-avoided',
    nodeId: 'g1-the-four-red-flags',
    applies: (s) => tagCount(s, 'scam-avoided'),
    text: () =>
      'You asked questions about the "sure thing" instead of paying. Guaranteed, fast, secret and urgent are the red flags to listen for.',
  },
  {
    key: 'impulse',
    nodeId: 'a6-the-48h-rule',
    applies: (s) => tagCount(s, 'impulse') + tagCount(s, 'waited'),
    text: ({ s }) =>
      tagCount(s, 'waited') > 0
        ? 'You waited out the flash sale. A 48-hour pause lets the urgency fade so the want can speak for itself.'
        : 'You bought during the flash sale. A treat is fine — a 48-hour pause just checks it is still wanted once the timer is gone.',
  },
  {
    key: 'deferred',
    nodeId: 'a3-the-calendar',
    applies: (s) => tagCount(s, 'deferred'),
    text: ({ titles }) =>
      `You moved ${list(lower(titles))} to later. Later still arrives, sometimes bigger — putting it on a calendar makes the trade visible.`,
  },
  {
    key: 'family',
    nodeId: 'f2-saying-yes-with-limits',
    applies: (s) => tagCount(s, 'planned-giving') + tagCount(s, 'said-no-kindly'),
    text: () =>
      'You said yes with a limit you chose ahead of time. Family and friends got real help, and the month kept its shape.',
  },
  {
    key: 'gave-family',
    nodeId: 'f7-big-events',
    applies: (s) => tagCount(s, 'gave-family'),
    text: ({ titles }) =>
      `You gave generously for ${list(lower(titles))}. Big family moments come every year — a small jar for them makes the next one easier.`,
  },
  {
    key: 'saved',
    nodeId: 'b2-first-10000',
    applies: (s) => tagCount(s, 'saved'),
    text: () => 'You moved money into the jar when it showed up. Small top-ups like that are how the first 10,000 DA happens.',
  },
  {
    key: 'jamiyya',
    nodeId: 'f3-tontine-mechanics',
    applies: (s) => tagCount(s, 'jamiyya'),
    text: () =>
      "The jam'iyya is saving with people you trust: steady contributions now, one lump later. Knowing your turn helps you plan around it.",
  },
  {
    key: 'subs',
    nodeId: 'a7-leaks',
    applies: (s) => tagCount(s, 'kept-sub') + tagCount(s, 'cancelled-sub'),
    text: ({ s }) =>
      tagCount(s, 'kept-sub') > 0
        ? 'The free trial became a monthly line. Small repeating costs are the quietest leaks — worth a look every month.'
        : 'You cancelled the trial before it converted. Catching small repeating costs is one of the easiest wins there is.',
  },
  {
    key: 'side-income',
    nodeId: 'e1-map-your-income',
    applies: (s) => tagCount(s, 'side-income'),
    text: () => 'You traded a weekend for extra income. Knowing every source — and what it costs you in rest — is mapping your income.',
  },
  {
    key: 'prices',
    nodeId: 'd4-budget-in-real-terms',
    applies: (s) => tagCount(s, 'prices'),
    text: () => 'Prices moved under you this month. Budgeting in real terms means expecting the same basket to cost more over time.',
  },
  {
    key: 'catch-up',
    nodeId: 'a3-the-calendar',
    applies: (s) => s.bills.filter((b) => !b.paid).length,
    text: () => 'Some bills rolled into catch-up. Seeing due dates against payday ahead of time shows where the month gets tight.',
  },
  {
    key: 'irregular',
    nodeId: 'e2-irregular-income-budget',
    applies: (s) => (s.characterId === 'yacine' ? 1 : 0),
    text: () => 'Income came in uneven chunks. Budgeting from your lowest likely month keeps the lumpy weeks from steering you.',
  },
  {
    key: 'flow',
    nodeId: 'a2-money-in-money-out',
    applies: () => 1,
    text: ({ s }) =>
      `Money in, money out: the month ended with ${fmtDA(s.cash)} in cash. Watching both sides is the whole game.`,
  },
  {
    key: 'room',
    nodeId: 'a8-breathing-room',
    applies: () => 1,
    text: () => 'Breathing room is what is left after the bills and the life events. It is a forecast, not a verdict.',
  },
  {
    key: 'cushion',
    nodeId: 'b1-why-a-cushion',
    applies: () => 1,
    text: () => 'A small cushion turns surprises into inconveniences. Even 2,000 DA set aside changes how a bad week feels.',
  },
]

const TAG_FOR_RULE: Record<string, Tag | undefined> = {
  'used-jar-often': 'used-jar',
  'used-jar': 'used-jar',
  deferred: 'deferred',
  'gave-family': 'gave-family',
}

function lessonsFor(s: GameState): Lesson[] {
  const out: Lesson[] = []
  for (const r of LESSON_RULES) {
    if (out.length === 3) break
    if (!NODE_IDS.has(r.nodeId)) continue
    if (out.some((l) => l.nodeId === r.nodeId)) continue
    const count = r.applies(s)
    if (count <= 0) continue
    const tag = TAG_FOR_RULE[r.key]
    const titles = tag ? titlesFor(s, tag) : []
    out.push({ nodeId: r.nodeId, text: r.text({ s, titles, count }) })
  }
  return out
}

/** A name for the month's shape — never a grade. */
function titleFor(s: GameState, c: Character, unpaid: number): { title: string; line: string } {
  const jarGrew = s.jar > c.startJar
  const jarThin = s.jar < Math.max(2000, c.startJar * 0.5)
  if (s.owed > 0 && s.warmth >= 65)
    return { title: 'Held by family', line: 'People caught you when cash ran short. Next month starts with a thank-you and a small repayment.' }
  if (unpaid > 0)
    return { title: 'A month of catching up', line: 'A few bills are still waiting. That is a to-do list for next month, not a judgement on this one.' }
  if (s.warmth >= 70 && jarThin)
    return { title: 'Lots of warmth, thin cushion', line: 'You showed up for people. The jar gave a lot to make that possible — a refill next month rebalances it.' }
  if (jarGrew && s.warmth >= 55)
    return { title: 'Steady hearth', line: 'Bills handled, the jar grew, and the people around you felt it too.' }
  if (jarGrew)
    return { title: 'Careful and calm', line: 'You protected the cushion. Next month there may be room to say yes to a little more warmth.' }
  if (s.owed > 0)
    return { title: 'Borrowed time, still standing', line: 'A small IOU carries into next month. Naming a date to repay it keeps it light.' }
  if (s.warmth >= 70)
    return { title: 'A warm, full month', line: 'Generous and present. The cushion held about where it was.' }
  return { title: 'Finding your rhythm', line: 'Money came in, money went out, and you made real choices about where. That is the practice.' }
}

export function summary(s: GameState): Summary {
  const c = charOf(s)
  const unpaid = s.bills.filter((b) => !b.paid)
  const { title, line } = titleFor(s, c, unpaid.length)
  return {
    characterId: s.characterId,
    cash: s.cash,
    jar: s.jar,
    jarDelta: s.jar - c.startJar,
    owed: s.owed,
    owedToMe: s.owedToMe,
    warmth: s.warmth,
    billsPaid: s.bills.length - unpaid.length,
    billsTotal: s.bills.length,
    catchUp: unpaid.map((b) => `${b.label} — ${fmtDA(b.amount)}`),
    ahead: s.ahead,
    title,
    titleLine: line,
    lessons: lessonsFor(s),
  }
}

/* ------------------------------ validation --------------------------- */

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/** Structural check for a persisted game: anything that doesn't look like a
 *  GameState from this version (or references unknown ids) is rejected. */
export function isGameState(x: unknown): x is GameState {
  if (!x || typeof x !== 'object') return false
  const s = x as Record<string, unknown>
  if (s.v !== 1 || typeof s.characterId !== 'string' || !characterById(s.characterId)) return false
  for (const k of ['seed', 'rng', 'week', 'cash', 'jar', 'owed', 'owedToMe', 'warmth', 'eventIdx']) {
    if (!isNum(s[k])) return false
  }
  for (const k of ['bills', 'incomes', 'pending', 'ahead', 'queue', 'used', 'groupsUsed', 'log', 'notices', 'flags']) {
    if (!Array.isArray(s[k])) return false
  }
  const week = s.week as number
  if (week < 1 || week > WEEKS + 1) return false
  const queue = s.queue as unknown[]
  if (!queue.every((id) => typeof id === 'string' && EVENT_BY_ID.has(id))) return false
  if (week <= WEEKS && (queue.length === 0 || (s.eventIdx as number) > queue.length)) return false
  return true
}
