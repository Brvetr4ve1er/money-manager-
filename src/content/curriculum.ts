/**
 * Skill-tree curriculum for the learning game. Pure content plus tiny lookup
 * helpers only — no imports from state or engines, so anything can import it
 * without a cycle.
 *
 * Audience: young adults in Algeria. Cash-first, often irregular or informal
 * income, two exchange rates, family obligations, Islamic-finance
 * sensibilities. Voice rules (shared with lessons.ts): second person, warm,
 * short sentences, playful-but-honest, DA examples, tradeoffs never verdicts,
 * no shame, no medical or therapeutic claims. Never assume a bank account.
 * Exchange-rate and inflation numbers are illustrative ("check today's
 * rate"), never official figures. Riba and zakat content describes
 * mainstream positions and defers rulings to a scholar the learner trusts.
 *
 * Node ids are stable — progress is persisted against them, so never rename.
 */

export type BranchId = 'flow' | 'save' | 'borrow' | 'dinar' | 'earn' | 'family' | 'guard' | 'grow'

export interface Branch {
  id: BranchId
  title: string
  blurb: string
  emoji: string
  order: number
}

export interface QuizOption {
  text: string
  correct: boolean
  why: string
}

export interface QuizQuestion {
  id: string
  prompt: string
  options: QuizOption[]
}

export type ApplyId =
  | 'has-account' | 'confirm-balance' | 'fx-set' | 'log-any' | 'log-7-days' | 'resisted'
  | 'has-obligation' | 'paid-obligation' | 'installment-tracked' | 'has-jar' | 'jar-with-target'
  | 'emergency-jar' | 'payday-split' | 'has-charm' | 'set-brake' | 'profile-set' | 'ran-sim'
  | 'has-tontine' | 'has-iou' | 'used-zakat' | 'inbox-confirmed' | 'trusted-set' | 'recurring-reviewed'

export interface SkillNode {
  /** Stable slug from the curriculum report — persisted, never rename. */
  id: string
  branch: BranchId
  /** Position within the branch, 1-based. */
  order: number
  title: string
  /** One sentence. */
  objective: string
  /** One sentence: the belief this node corrects. */
  misconception: string
  /** Node ids; may cross branches; always acyclic. */
  prereqs: string[]
  /** ≤ 120 words, plain text, 2–4 short paragraphs separated by \n\n. */
  lesson: string
  /** Scenario-based; exactly 4 options each, exactly one correct. */
  quiz: [QuizQuestion, QuizQuestion]
  /** One sentence: a concrete action in the app or in life. */
  tryIt: string
  /** The in-app action that proves the skill, or null if none fits. */
  apply: ApplyId | null
}

export const BRANCHES: ReadonlyArray<Branch> = [
  { id: 'flow', title: 'Flow', blurb: 'Where your money actually goes, and when it goes.', emoji: '💸', order: 1 },
  { id: 'save', title: 'Save', blurb: 'Cushions, goals and the habit of paying yourself first.', emoji: '🫙', order: 2 },
  { id: 'borrow', title: 'Borrow', blurb: 'Debts formal and informal, and what credit really costs.', emoji: '🧾', order: 3 },
  { id: 'dinar', title: 'Dinar', blurb: 'Prices, two exchange rates, and what your dinars really buy.', emoji: '💱', order: 4 },
  { id: 'earn', title: 'Earn', blurb: 'Every income you have, mapped, priced and protected.', emoji: '🛠️', order: 5 },
  { id: 'family', title: 'Family', blurb: 'Family, friends, jam’iyya and giving, planned with dignity.', emoji: '🏠', order: 6 },
  { id: 'guard', title: 'Guard', blurb: 'Scams, codes, and what to do if it happens anyway.', emoji: '🛡️', order: 7 },
  { id: 'grow', title: 'Grow', blurb: 'Letting long-term money work, with a halal lens.', emoji: '🌱', order: 8 },
]

// — Authoring helpers (not exported) —

type Four = [QuizOption, QuizOption, QuizOption, QuizOption]
interface DraftQuestion {
  prompt: string
  options: Four
}
type DraftNode = Omit<SkillNode, 'quiz' | 'lesson'> & {
  lesson: string[]
  quiz: [DraftQuestion, DraftQuestion]
}

/** The correct option. */
function ok(text: string, why: string): QuizOption {
  return { text, correct: true, why }
}

/** A distractor: a real misconception, corrected gently. */
function no(text: string, why: string): QuizOption {
  return { text, correct: false, why }
}

/** Joins paragraphs and stamps question ids as `<node id>/q1`, `/q2`. */
function node(d: DraftNode): SkillNode {
  return {
    ...d,
    lesson: d.lesson.join('\n\n'),
    quiz: [
      { id: `${d.id}/q1`, ...d.quiz[0] },
      { id: `${d.id}/q2`, ...d.quiz[1] },
    ],
  }
}

export const NODES: ReadonlyArray<SkillNode> = [
  // ───────────────────────── Flow ─────────────────────────
  node({
    id: 'a1-where-money-goes',
    branch: 'flow',
    order: 1,
    title: 'Where did it go?',
    objective: 'Record every dinar that leaves for seven days, and compare real spending with remembered spending.',
    misconception: 'I know roughly what I spend.',
    prereqs: [],
    lesson: [
      'Ask anyone what they spent last week and you get a confident number. Then they log it for seven days, and the real one is higher, often by a fifth or more. Nobody lied. Small cash spends just don’t stick in memory: a 40 DA bus, a 150 DA coffee, a 500 DA top-up.',
      'For one week, log every dinar that leaves, the moment it leaves. Cash, CCP, BaridiMob, coins to a little cousin. No judging, no budget yet. Just evidence.',
      'At the end of the week you’ll have something most people never see: your actual money, not the story about it.',
    ],
    quiz: [
      {
        prompt: 'Khaled guesses he spends about 6,000 DA a week. Three days into logging, he’s already at 4,800 DA. What’s the most useful next step?',
        options: [
          no('Stop logging, since it’s making him feel bad.', 'The discomfort is the information arriving. Finishing the week is what makes it useful.'),
          ok('Keep logging to day seven, then compare the real total with his guess.', 'A full week shows the pattern, not just one heavy day.'),
          no('Cut spending to zero for the rest of the week.', 'A sudden freeze hides the very pattern he set out to see.'),
          no('Decide it was an unusual week and go back to his guess.', 'Most weeks feel unusual. The log is what tells him which ones really are.'),
        ],
      },
      {
        prompt: 'Lina pays mostly in cash and tends to forget the small stuff. Which logging habit catches the most?',
        options: [
          no('Log the whole week from memory on Sunday.', 'Memory is exactly what drops the small cash spends.'),
          ok('Log right after each spend, even a 30 DA one.', 'Logging in the moment beats remembering later.'),
          no('Only log things above 1,000 DA.', 'The small items are where the gap between guess and reality lives.'),
          no('Check her CCP statement at month end.', 'Cash never shows up on a statement, and most of her spending is cash.'),
        ],
      },
    ],
    tryIt: 'Log every spend for seven days in a row, starting with the very next one, however small.',
    apply: 'log-7-days',
  }),
  node({
    id: 'a2-money-in-money-out',
    branch: 'flow',
    order: 2,
    title: 'In, out, and what’s left',
    objective: 'Work out money in minus money out for a month, even when income is irregular.',
    misconception: 'A budget is only for people with a fixed salary.',
    prereqs: ['a1-where-money-goes'],
    lesson: [
      'Every month has one simple sum: what came in, minus what went out, equals your breathing room. It works the same for a salary, delivery tips, help from parents or three small gigs.',
      'Irregular income doesn’t break the sum. It just means you do it after the month, from real numbers, instead of before it, from hopes. Add every inflow. Add every outflow from your log. Subtract.',
      'A positive number is room to save or plan. A negative one isn’t a failure. It means something was covered by savings, a loan or a generous aunt. Either way, now you know which.',
    ],
    quiz: [
      {
        prompt: 'Hamza had 38,000 DA come in last month from two jobs and spent 41,000 DA. What does the −3,000 DA tell him?',
        options: [
          no('That he’s bad with money.', 'The number describes a month, not a person.'),
          ok('That 3,000 DA of spending came from somewhere else: savings, a loan or a favour.', 'A gap always gets filled by something. Naming it is the point.'),
          no('Nothing, because his income isn’t fixed.', 'The sum works on irregular income too; it just uses real numbers.'),
          no('That he needs to earn more before tracking anything.', 'Tracking is what shows whether earning more, or spending differently, would help most.'),
        ],
      },
      {
        prompt: 'Nadia earns between 25,000 and 55,000 DA a month from tutoring. When is the in-out sum most useful for her?',
        options: [
          no('Only in good months.', 'The lean months are where the sum teaches the most.'),
          ok('At the end of every month, using what actually came in.', 'Real numbers, month after month, show her true range.'),
          no('Never, since it only works with a payslip.', 'A payslip makes it easier, not possible.'),
          no('Once a year.', 'A yearly total hides the tight months inside an average.'),
        ],
      },
    ],
    tryIt: 'Enter your monthly income and essential costs in your profile so the app can show your breathing room.',
    apply: 'profile-set',
  }),
  node({
    id: 'a3-the-calendar',
    branch: 'flow',
    order: 3,
    title: 'The money calendar',
    objective: 'Place rent, phone, transport and family payments on a calendar and spot the tight week.',
    misconception: 'The problem is how much I spend, never when I spend it.',
    prereqs: ['a2-money-in-money-out'],
    lesson: [
      'A lot of money stress isn’t “too little”. It’s “wrong week”. Amine earns 45,000 DA on the 5th. His rent share (15,000) and internet (2,500) land on the 1st, his mother’s share on the 10th, the phone on the 20th. By the 28th he has 800 DA and no idea where it went.',
      'Nothing went anywhere. It just left in the wrong order.',
      'A money calendar puts every fixed outflow on its date. You see the tight week before it arrives, move what can move, and keep a small cushion for what can’t. Totals tell you if you’re OK. The calendar tells you when you’re not.',
    ],
    quiz: [
      {
        prompt: 'Amine is paid on the 5th, but rent is due on the 1st. Which move fixes the timing?',
        options: [
          ok('Ask the landlord to move it to the 6th, and bridge the first gap once from a small cushion.', 'Lines up money out with money in; the cushion only has to bridge the gap one time.'),
          no('Pay rent late every month and live with the arguments.', 'That keeps the stress and puts the home at risk, when the fix is a date.'),
          no('Borrow 15,000 DA from a cousin each month.', 'That turns a timing problem into a debt that never ends.'),
          no('Spend nothing at all from the 1st to the 5th.', 'Bus fares and food don’t stop for five days, so the plan wouldn’t hold.'),
        ],
      },
      {
        prompt: 'Amine gives his parents 5,000 DA in cash on the 10th of every month. Does it belong on the calendar?',
        options: [
          no('No, only bills with a paper invoice count.', 'Family contributions are as fixed as rent, invoice or not.'),
          ok('Yes, anything that leaves on a known date belongs there.', 'Predictable outflows are calendar items, whoever receives them.'),
          no('Only if it’s over 10,000 DA.', 'Several small dated items can make a tight week too.'),
          no('Only if he pays it through BaridiMob.', 'The calendar doesn’t care about the channel, and most outflows are cash.'),
        ],
      },
    ],
    tryIt: 'Add your three biggest dated outflows, like rent share, family and phone, as obligations with their due days.',
    apply: 'has-obligation',
  }),
  node({
    id: 'a4-needs-wants-later',
    branch: 'flow',
    order: 4,
    title: 'Need, want, later',
    objective: 'Sort spending into need, want and later, and choose one “later” you can live with.',
    misconception: 'If I can afford it this month, it’s fine.',
    prereqs: ['a1-where-money-goes'],
    lesson: [
      'Every spend in your log fits one of three boxes. A need keeps life running: food, transport to work, the rent share. A want makes life nicer right now: a café with friends, new trainers. A later is a want that can wait without hurting anything.',
      'Wants aren’t the enemy. A month with zero wants often ends in one big splurge. The trick is the third box. “Later” isn’t “no”. It’s a want moved to the month where it fits.',
      '“I can afford it” answers whether the money exists. Need, want, later answers what else that money was going to do.',
    ],
    quiz: [
      {
        prompt: 'Yasmine can technically afford 9,000 DA trainers this month, but the 20th is always tight for her. Which label helps most?',
        options: [
          no('Need, because she can afford them.', 'Being affordable doesn’t make something a need; it just means the cash exists.'),
          ok('Later: a real want, moved to a month where the tight week isn’t at risk.', 'She keeps the want and protects the 20th.'),
          no('Want, and buy them now, since wants are fine.', 'Wants are fine, but this one collides with a known tight week.'),
          no('Never, since trainers are a waste.', 'Calling every want a waste tends to backfire into bigger splurges.'),
        ],
      },
      {
        prompt: 'Walid sorts his week: bus fares, a data top-up he uses for delivery work, and a 1,200 DA pizza night. How do they sort?',
        options: [
          no('All needs, because he works hard.', 'Effort doesn’t change the box. The pizza is still a want, and that’s fine.'),
          no('All wants, because he could walk.', 'Getting to paid work is a need, even if a cheaper route exists.'),
          ok('Bus and the work top-up are needs; pizza night is a want.', 'Honest labels, no guilt: the want is visible and chosen.'),
          no('It doesn’t matter as long as the total is fine.', 'The total hides which spends can flex when a month gets tight.'),
        ],
      },
    ],
    tryIt: 'Next time you postpone a want, log it as resisted so your “later” pile becomes visible.',
    apply: 'resisted',
  }),
  node({
    id: 'a5-cash-envelopes',
    branch: 'flow',
    order: 5,
    title: 'Envelopes without a bank',
    objective: 'Split cash income into envelopes on the day it arrives.',
    misconception: 'Envelopes only work for digital money.',
    prereqs: ['a2-money-in-money-out', 'a4-needs-wants-later'],
    lesson: [
      'Envelopes are older than banks. Money arrives, and before anything else happens you split it into labelled piles: rent, food, transport, family, savings. When an envelope is empty, that category is done for the month.',
      'It works with paper envelopes, a tin, a drawer, or jars in this app that mirror the cash you hold. The magic is the timing: split on payday, while the full amount still feels like a lot.',
      'If one envelope runs dry, you can move money from another. That’s allowed. It’s just a decision now, made on purpose, instead of a surprise at the end of the month.',
    ],
    quiz: [
      {
        prompt: 'Salma gets 30,000 DA in cash for a freelance job. When is the best moment to split it?',
        options: [
          ok('Right away, the same day, before any spending.', 'Splitting first gives every dinar a job before the month can grab it.'),
          no('At the end of the month, to see what’s left.', 'By then the leftovers have usually found jobs she didn’t choose.'),
          no('Only once she has a bank account.', 'Cash envelopes need no bank at all; that’s where they started.'),
          no('When the next payment comes, so she can split both at once.', 'Waiting lets the first payment drift with no plan.'),
        ],
      },
      {
        prompt: 'Mid-month, Salma’s food envelope is empty but transport still has 3,000 DA. What fits the envelope method?',
        options: [
          no('Borrow from a friend so the envelopes stay neat.', 'A loan to keep envelopes tidy defeats their purpose.'),
          ok('Move some from transport to food, knowing transport is now tighter.', 'Moving money is allowed; it just becomes a visible tradeoff.'),
          no('Skip proper meals until payday.', 'Envelopes are there to serve her life, not the other way round.'),
          no('Give up on envelopes, since they don’t work.', 'One empty envelope is the method working: it showed her where the pressure is.'),
        ],
      },
    ],
    tryIt: 'On your next payday, split the money into at least three jars in the app on the same day it arrives.',
    apply: 'payday-split',
  }),
  node({
    id: 'a6-the-48h-rule',
    branch: 'flow',
    order: 6,
    title: 'The 48-hour rule',
    objective: 'Wait 48 hours before any non-routine purchase above your own threshold.',
    misconception: 'If I don’t buy it now, the deal disappears.',
    prereqs: ['a4-needs-wants-later'],
    lesson: [
      'A promo on a 60,000 DA phone “ends tonight”. That urgency is the product, not the phone.',
      'The 48-hour rule: for any non-routine purchase above your threshold, say 3,000 DA, note it, wait two days, then decide. In 48 hours the rush fades, you check whether the deal really beats the usual price, and you see whether this month’s tight week can take the hit.',
      'Half the time you still buy. Fine: now it’s a decision. The other half, you just kept a month of bus money. The rule isn’t about saying no. It’s about being the one who decides.',
    ],
    quiz: [
      {
        prompt: 'Yasmine sees “last 3 units, 30% off” on a Facebook shop page. What does the 48-hour rule suggest?',
        options: [
          no('Pay by CCP now, before the stock runs out.', 'Urgency plus paying first to a page are two classic scam signs.'),
          ok('Note it, and check the usual price tomorrow.', 'Two days and a price check beat a countdown timer.'),
          no('Ask in the comments whether she should buy.', 'A comment thread adds pressure; it isn’t a price check.'),
          no('Buy it and plan to resell if she regrets it.', 'Reselling rarely gets the money back; it’s a reason, not a plan.'),
        ],
      },
      {
        prompt: 'Two days later, Yasmine still wants it and it fits her calendar. What now?',
        options: [
          no('The rule failed, since she still wants it.', 'The rule’s job was to make it a choice. It did.'),
          ok('Buy it, and log it as a want so the month stays honest.', 'A considered want, paid in cash, fits the plan.'),
          no('Wait another week just to be sure.', 'Endless waiting is its own way of not deciding.'),
          no('Take an installment plan so the cash stays in her pocket.', 'That adds a mark-up to something she can already afford.'),
        ],
      },
    ],
    tryIt: 'Set a spending brake at your own threshold so the app asks you to pause before big non-routine buys.',
    apply: 'set-brake',
  }),
  node({
    id: 'a7-leaks',
    branch: 'flow',
    order: 7,
    title: 'Small leaks, big hole',
    objective: 'Find three repeat small spends and see what each one costs over a year.',
    misconception: 'Small amounts don’t matter.',
    prereqs: ['a1-where-money-goes', 'a4-needs-wants-later'],
    lesson: [
      'A 100 DA coffee is nothing. A 100 DA coffee every workday is about 2,200 DA a month and over 26,000 DA a year. That’s a phone repair, or a big piece of the Eid fund.',
      'Leaks hide because each drop feels harmless: a daily coffee, an extra data top-up, a delivery fee, a subscription you forgot. Multiply any repeat spend by how often it happens in a year, and it stops being small.',
      'The point isn’t to cut them all. Some leaks are worth every dinar. The point is to choose which ones stay, instead of letting them choose for you.',
    ],
    quiz: [
      {
        prompt: 'Khaled buys a 500 DA data top-up about twice a week on top of his monthly pack. Roughly what does that cost him in a year?',
        options: [
          no('About 4,000 DA.', 'That’s about one month. The year is twelve of those.'),
          ok('About 50,000 DA.', '500 × 2 × 52 is around 52,000 DA. A bigger monthly pack might cost far less.'),
          no('Nothing worth counting, since top-ups are small.', 'Small and frequent is exactly how a leak works.'),
          no('About 1,000 DA.', 'That’s one week. Leaks only show when you multiply.'),
        ],
      },
      {
        prompt: 'Lina finds three leaks: a 1,500 DA streaming plan she uses daily, about 4,000 DA a month in delivery fees, and a gaming subscription she forgot about. What’s a reasonable response?',
        options: [
          no('Cancel all three, to be strict.', 'Cutting the thing she enjoys every day tends to backfire.'),
          ok('Keep the one she uses daily, cancel the forgotten one, and set a cap on delivery fees.', 'Choosing which leaks stay is the whole skill.'),
          no('Keep them all, since they’re small amounts.', 'Together they add up to tens of thousands of DA a year.'),
          no('Feel bad about it and change nothing.', 'Guilt doesn’t plug a leak; a decision does.'),
        ],
      },
    ],
    tryIt: 'Review your recurring spends in the app and decide, one by one, which stay and which go.',
    apply: 'recurring-reviewed',
  }),
  node({
    id: 'a8-breathing-room',
    branch: 'flow',
    order: 8,
    title: 'Breathing room',
    objective: 'Keep a buffer of at least one tight week of expenses before funding anything else.',
    misconception: 'Saving comes after spending, if anything is left.',
    prereqs: ['a3-the-calendar', 'a5-cash-envelopes'],
    lesson: [
      'Your calendar showed you the tight week. Breathing room is the money that gets you through it without borrowing.',
      'Work out what one tight week costs: food, transport, the bills that land then. Say 8,000 DA. That amount sits in its own jar and stays off-limits for wants. It’s the first thing funded on payday, before goals, before treats.',
      'It isn’t savings yet. It’s what stops one late payment or one surprise taxi from turning into a loan. Once it holds steady for two months in a row, the rest of the plan has solid ground to stand on.',
    ],
    quiz: [
      {
        prompt: 'Nadia’s tight week costs about 9,000 DA. Her buffer jar holds 4,000 DA. A friend invites her on a 6,000 DA trip. What protects the plan?',
        options: [
          no('Use the buffer; it’s only one trip.', 'That leaves the tight week uncovered, which is the buffer’s whole job.'),
          ok('Fill the buffer to 9,000 DA first, then see what’s left for the trip.', 'Buffer first, then wants. The trip might just move a month.'),
          no('Go, and borrow if the tight week bites.', 'That plans a loan in advance.'),
          no('Never travel until she has three months saved.', 'Wants still have a place once the buffer is in.'),
        ],
      },
      {
        prompt: 'Amine’s buffer has held 10,000 DA for two months. His phone screen cracks, and the repair is 7,000 DA. He needs the phone for work. What’s the buffer for?',
        options: [
          no('Not this; it’s only for rent.', 'The buffer covers tight-week surprises, and a work phone counts.'),
          ok('Exactly this: use it, then refill it over the next paydays.', 'Using it is the buffer doing its job. Refilling keeps it working.'),
          no('Take a shop installment and keep the buffer full.', 'That pays a mark-up to protect money meant for this moment.'),
          no('Ignore the phone until next month.', 'Possible, but losing work for a month usually costs more than 7,000 DA.'),
        ],
      },
    ],
    tryIt: 'Create a buffer jar sized to your tight week and fund it first on your next payday.',
    apply: 'has-jar',
  }),

  // ───────────────────────── Save ─────────────────────────
  node({
    id: 'b1-why-a-cushion',
    branch: 'save',
    order: 1,
    title: 'Why a cushion',
    objective: 'Explain what one month of essentials in reserve protects you from.',
    misconception: 'Saving for emergencies is pessimistic; family or fate will provide.',
    prereqs: ['a2-money-in-money-out'],
    lesson: [
      'Phones die. Contracts end. A parent needs a hospital visit. That isn’t pessimism; it’s a normal year. The only question is how you pay when it happens.',
      'Without a cushion, the answer is usually a loan, a taqsit with a mark-up, or a hard conversation with family. With one, it’s an inconvenience: you pay, you refill, life goes on.',
      'Many people see trust and preparation as partners: tie your camel, then trust. A cushion also means that when family needs help, you can be the one who helps.',
      'Start by naming the number: one month of essentials.',
    ],
    quiz: [
      {
        prompt: 'Walid’s essentials come to about 28,000 DA a month. What’s a sensible first cushion target?',
        options: [
          ok('About 28,000 DA: one month of essentials.', 'One month is a real, reachable first line of defence.'),
          no('300,000 DA, or it isn’t worth starting.', 'A huge first target usually means never starting.'),
          no('Nothing, since his family will step in.', 'Family may help, but a cushion means he doesn’t have to ask every time.'),
          no('Whatever is left at the end of the year.', 'Leftovers rarely survive a year; a named number does.'),
        ],
      },
      {
        prompt: 'Nadia’s brother says saving for emergencies shows a lack of faith. What’s a respectful way to see it?',
        options: [
          no('He’s right, so saving is pointless.', 'Most people across traditions see preparing as part of acting responsibly.'),
          ok('Preparing and trusting can go together, like tying the camel and then trusting.', 'The effort is hers; the outcome was never in her hands anyway.'),
          no('Hide her savings and argue later.', 'Privacy is fine, but she doesn’t need to win an argument to keep a cushion.'),
          no('Spend it all to avoid the debate.', 'That trades her safety for a moment of peace.'),
        ],
      },
    ],
    tryIt: 'Create an emergency jar and set its target to one month of your essentials.',
    apply: 'emergency-jar',
  }),
  node({
    id: 'b2-first-10000',
    branch: 'save',
    order: 2,
    title: 'The first 10,000 DA',
    objective: 'Reach a starter fund of 10,000 DA through small deposits made on payday.',
    misconception: 'You need a big salary before you can save.',
    prereqs: ['b1-why-a-cushion'],
    lesson: [
      'Nobody saves “what’s left”. By month end there’s nothing left; that’s how months work.',
      'The first 10,000 DA is built by taking it first. The day money arrives, 1,000 or 2,000 DA goes into an envelope, a jar, or a tin at your mother’s. Ten weeks at 1,000 DA is 10,000 DA: a screen repair, a few months of internet, an emergency taxi to the hospital.',
      'Income irregular? Make it a percentage, like 10% of whatever comes in. The number matters less than the ritual: money in, cushion first.',
    ],
    quiz: [
      {
        prompt: 'Walid earns 2,000–8,000 DA a week from deliveries. Which saving rule is most likely to last?',
        options: [
          no('Save 5,000 DA a month, no matter what.', 'A fixed amount breaks on a bad week, and then the habit breaks too.'),
          no('Save whenever a good week comes.', '“Whenever” rarely arrives without a trigger.'),
          ok('Move 10% of each payment to the cushion the day it lands.', 'It scales with his income and runs on habit.'),
          no('Wait until he has a steady job.', 'The cushion is what makes an unsteady job survivable.'),
        ],
      },
      {
        prompt: 'Walid reaches 10,000 DA and a friend asks to borrow 6,000 DA. What protects both the cushion and the friendship?',
        options: [
          no('Lend it all, since it’s just sitting there.', 'Sitting there, ready, is the cushion’s whole job.'),
          ok('Explain it’s his emergency fund, and offer a smaller amount from spending money.', 'The cushion stays whole and the friend still gets help.'),
          no('Lend it and stop saving for a while.', 'That’s two steps back at once.'),
          no('Lend it at 10% to make it worth it.', 'Interest on a personal loan is riba in mainstream Islamic views, and it can sour a friendship.'),
        ],
      },
    ],
    tryIt: 'Name your emergency jar “Sanduq”, set a 10,000 DA target, and log a first deposit, even 200 DA.',
    apply: 'emergency-jar',
  }),
  node({
    id: 'b3-where-to-keep-it',
    branch: 'save',
    order: 3,
    title: 'Where to keep it',
    objective: 'Choose a place for the cushion that is safe and slightly annoying to reach.',
    misconception: 'Under the mattress is the only safe place for savings.',
    prereqs: ['b2-first-10000'],
    lesson: [
      'A cushion needs two things. It has to be safe, and it has to be a little hard to reach: safe from theft, from fire, and from your own Thursday-night shopping.',
      'Every option is a tradeoff. Cash at home is instant, but easy to dip into and to lose. A separate CCP account or savings book adds a step. A sealed envelope at a trusted relative’s adds a conversation. A bank or Islamic-window account adds paperwork and distance.',
      'Some people avoid interest for religious reasons; non-interest options exist, and a scholar you trust can help you weigh them. Whatever you pick, note where it is and what stops you grabbing it.',
    ],
    quiz: [
      {
        prompt: 'Hamza keeps his 15,000 DA cushion in his wallet. Which change fits “safe and slightly annoying”?',
        options: [
          no('Keep it in the wallet so it’s ready.', 'Ready for emergencies, and also for every snack and impulse.'),
          ok('Move it to a separate place, like a second CCP account or a sealed envelope at home.', 'One extra step turns dipping in into a decision.'),
          no('Lend it to a friend so it’s out of reach.', 'Out of reach for emergencies too, and dependent on the friend.'),
          no('Turn it into gold jewellery.', 'Selling jewellery quickly usually means a loss, which is hard on emergency money.'),
        ],
      },
      {
        prompt: 'Lina avoids interest for religious reasons and wants her cushion out of her wallet. What fits?',
        options: [
          no('She has no option but the mattress.', 'There are non-interest options: a separate CCP balance, an Islamic-window account, a trusted relative.'),
          ok('A non-interest place one step away, and a scholar she trusts if she wants a ruling on a product.', 'It respects her view and still adds distance.'),
          no('Any account at all is equally fine.', 'That depends on her view, and it’s hers to weigh.'),
          no('Give it to a jam’iyya organiser to hold.', 'A pot is for rotating savings, not for money she may need tonight.'),
        ],
      },
    ],
    tryIt: 'Add the place your cushion lives, even a tin at home, as its own account in the app.',
    apply: 'has-account',
  }),
  node({
    id: 'b4-sinking-funds',
    branch: 'save',
    order: 4,
    title: 'Sinking funds',
    objective: 'Pre-fund predictable lump costs like Eid, Ramadan and back-to-school with monthly amounts.',
    misconception: 'Eid always wrecks the budget, and nothing can be done about it.',
    prereqs: ['a3-the-calendar', 'b2-first-10000'],
    lesson: [
      'Eid el-Adha is not a surprise. Neither is Ramadan’s grocery bill, back-to-school in September, or your cousin’s wedding in July. Yet every year these “emergencies” send people to the taqsit shop or to an uncle.',
      'A sinking fund turns a known lump into small monthly pieces. A sheep around 70,000 DA in ten months is 7,000 DA a month, in a jar marked “Eid”. When the day comes, the money is there and you shop calmly.',
      'List the year’s predictable lumps, date them, divide by the months remaining. That’s the whole technique.',
    ],
    quiz: [
      {
        prompt: 'It’s November. Eid el-Adha is roughly six months away, and Khaled expects a sheep to cost around 70,000 DA. What’s the monthly amount?',
        options: [
          ok('About 11,700 DA.', '70,000 ÷ 6. Steady pieces instead of one shock.'),
          no('70,000 DA in May.', 'That’s the problem, not the plan.'),
          no('5,000 DA, with the rest from the emergency fund.', 'Eid has a date; the emergency fund is for the surprises.'),
          no('Nothing, since the family pools money anyway.', 'Pooling still needs his share, on a date.'),
        ],
      },
      {
        prompt: 'Khaled is a self-employed electrician. Which of these is a sinking-fund item for him?',
        options: [
          no('A hospital visit after a scooter fall.', 'Unpredictable, so that’s the emergency fund’s job.'),
          ok('His yearly social-security contribution.', 'Known amount, known date: a perfect sinking fund.'),
          no('His daily bus fare.', 'A routine weekly cost, handled by the transport envelope.'),
          no('A friend’s unexpected request for help.', 'That belongs to a limit for requests, not a sinking fund.'),
        ],
      },
    ],
    tryIt: 'Create a jar with a target and a date for the next Eid or Ramadan, and let the app work out the monthly amount.',
    apply: 'jar-with-target',
  }),
  node({
    id: 'b5-goal-math',
    branch: 'save',
    order: 5,
    title: 'Goal math',
    objective: 'Turn any target into amount divided by months, and test it against your breathing room.',
    misconception: 'You set a goal and hope it works out.',
    prereqs: ['b4-sinking-funds'],
    lesson: [
      'Every goal is a division. A 120,000 DA laptop in eight months is 15,000 DA a month. That’s it.',
      'The second step is the honest one: does 15,000 DA fit? Check it against your in-out sum and your tight week. If your month usually ends at +6,000 DA, the goal doesn’t fit as written.',
      'Then you have three levers: more months, a smaller target, or more income. Twelve months makes it 10,000. A refurbished laptop at 80,000 over eight months makes it 10,000 too. Picking a lever is planning. Skipping the math is hoping.',
    ],
    quiz: [
      {
        prompt: 'Yasmine wants 90,000 DA for driving lessons in six months. Her month usually ends with about 9,000 DA spare. What does the math say?',
        options: [
          no('It works; she’ll manage somehow.', '90,000 ÷ 6 is 15,000 a month, more than the 9,000 she has spare.'),
          ok('It needs 15,000 DA a month, so stretch to ten months or find extra income.', 'Ten months at 9,000 DA gets her there without borrowing.'),
          no('Take it all from the emergency fund.', 'That empties the cushion for a goal that has a date.'),
          no('Give up; it’s too expensive.', 'The goal is fine. The timeline just needs adjusting.'),
        ],
      },
      {
        prompt: 'Khaled wants 60,000 DA for a used motorbike. He already has 24,000 DA and gives himself six months. What’s the monthly amount?',
        options: [
          no('10,000 DA.', 'That ignores the 24,000 DA he already has.'),
          ok('6,000 DA.', '(60,000 − 24,000) ÷ 6 = 6,000.'),
          no('4,000 DA.', 'That’s 24,000 ÷ 6, the wrong part of the sum.'),
          no('36,000 DA.', 'That’s the whole remaining amount, not the monthly piece.'),
        ],
      },
    ],
    tryIt: 'Give a jar a target and a date, and check that its monthly amount fits inside your breathing room.',
    apply: 'jar-with-target',
  }),
  node({
    id: 'b6-rebuild-after-use',
    branch: 'save',
    order: 6,
    title: 'Spend it, then rebuild',
    objective: 'Use the cushion without guilt and restart deposits within 30 days.',
    misconception: 'If I touch the emergency fund, I’ve failed.',
    prereqs: ['b2-first-10000'],
    lesson: [
      'The day you use your emergency fund is the day it works. The fridge died, the cushion paid, nobody borrowed. That’s a win, not a failure.',
      'The real risk is what comes next. People who feel guilty about using the fund often stop feeding it, so the next surprise finds an empty jar.',
      'So the habit is simple: use it, then restart deposits on the very next payday, even at a smaller amount. Thirty days is the target. Rebuilding is a skill of its own, and each time you do it, the cushion becomes a habit rather than a one-off.',
    ],
    quiz: [
      {
        prompt: 'Salma uses 12,000 DA of her 15,000 DA cushion for a dental bill. What’s the healthiest way to see it?',
        options: [
          no('She failed at saving.', 'The fund did exactly what it was built for.'),
          ok('The cushion worked, and she restarts deposits on the next payday.', 'No loan, no panic, and a plan to refill.'),
          no('Saving is pointless because it never lasts.', 'It lasted long enough to pay the bill. That’s the point.'),
          no('Next time she’ll hide it even from herself.', 'A cushion she can’t reach in an emergency isn’t a cushion.'),
        ],
      },
      {
        prompt: 'After the bill, Salma can only spare 1,000 DA a week instead of her usual 2,000. What works best?',
        options: [
          no('Wait until she can do 2,000 again.', 'Waiting breaks the habit; a smaller deposit keeps it alive.'),
          ok('Start at 1,000 DA a week right away.', 'Restarting fast matters more than the amount.'),
          no('Borrow 12,000 DA to refill it at once.', 'Borrowing to refill a cushion just moves the hole.'),
          no('Pause saving until next year.', 'A year with an empty cushion is a long time to be exposed.'),
        ],
      },
    ],
    tryIt: 'If you’ve used your emergency jar, make a deposit into it within 30 days, any size.',
    apply: 'emergency-jar',
  }),
  node({
    id: 'b7-three-months',
    branch: 'save',
    order: 7,
    title: 'Three months',
    objective: 'Grow the cushion in stages toward three months of essentials.',
    misconception: 'Three months of savings is only for rich people.',
    prereqs: ['b6-rebuild-after-use'],
    lesson: [
      'One month of cushion covers a surprise. Three months covers a season: a contract that isn’t renewed, a slow summer for gig work, a family crisis that drags on.',
      'It sounds huge. With essentials at 30,000 DA a month, it’s 90,000 DA. But nobody saves 90,000 DA. They save 1,000 DA a week, or 10% of each payment, and pass milestones: 10,000, then one month, then two.',
      'There’s no deadline. Some people get there in a year, some in three. A good month or an Eid gift can skip a stage. The stages are what make a big number feel possible.',
    ],
    quiz: [
      {
        prompt: 'Amine’s essentials are 30,000 DA a month, and he has 30,000 DA saved. What’s a good next milestone?',
        options: [
          ok('60,000 DA: two months.', 'Stages keep the big target within reach.'),
          no('Nothing more; one month is plenty at his age.', 'One month is a great start, and gaps in work can happen at any age.'),
          no('Invest it all to grow faster.', 'Cushion money needs to be reachable, not growing.'),
          no('Jump to 90,000 DA this month.', 'A target that can’t be met tends to get abandoned.'),
        ],
      },
      {
        prompt: 'Lina gets an unexpected 20,000 DA gift. Her cushion covers about six weeks. What’s one reasonable split?',
        options: [
          no('All on a new phone, since gifts are for fun.', 'Fun is allowed, but none of it moves her safety forward.'),
          ok('Part to the cushion, part to something she enjoys.', 'A planned split moves her forward and still feels like a gift.'),
          no('Lend it all to a cousin.', 'That’s a separate decision, best made from truly spare money.'),
          no('Keep it in her wallet for now.', 'Money with no job tends to get spent by default.'),
        ],
      },
    ],
    tryIt: 'Raise your emergency jar’s target to three months of essentials and watch the stages fill.',
    apply: 'emergency-jar',
  }),
  node({
    id: 'b8-saving-with-others',
    branch: 'save',
    order: 8,
    title: 'Saving with others',
    objective: 'Compare a jam’iyya, a family pot and a solo goal for the same target.',
    misconception: 'A jam’iyya is either free money or a kind of gambling.',
    prereqs: ['b4-sinking-funds', 'f3-tontine-mechanics'],
    lesson: [
      'Three ways to save 60,000 DA. Solo: a jar, 5,000 DA a month. Flexible and private, but easy to raid. A family pot: a parent holds it. Harder to raid, but it leans on that relationship. A jam’iyya: six friends pay 10,000 DA a month and take turns collecting 60,000.',
      'The jam’iyya isn’t free money and isn’t a bet: you get back exactly what you put in. What it adds is group pressure to keep paying, and timing. An early turn works like an interest-free loan; a late turn is forced saving.',
      'Pick the one whose weak point you can live with.',
    ],
    quiz: [
      {
        prompt: 'Yasmine keeps raiding her solo savings jar. Her colleagues offer a jam’iyya she can afford. What does it mainly add?',
        options: [
          no('Extra money on top of what she pays in.', 'She gets back exactly what she paid, nothing more.'),
          ok('Group commitment that makes skipping a month much harder.', 'That outside push is exactly what her solo jar lacks.'),
          no('Gambling risk, so she’d likely lose money.', 'Nobody wins or loses by chance; everyone gets the same total.'),
          no('Nothing; it’s the same as a jar.', 'The timing and the group pressure are real differences.'),
        ],
      },
      {
        prompt: 'Khaled needs a laptop in two months, but the only jam’iyya on offer gives him turn 6 of 6. What fits?',
        options: [
          no('Join anyway; it’s the same money.', 'Turn 6 means waiting six months, too late for his need.'),
          ok('Ask for an early turn, or use another method for this goal.', 'Turn order is the jam’iyya’s main lever, and it has to match the goal.'),
          no('Join, and plan to stop paying once he has the laptop.', 'Leaving after collecting is how groups fall apart, and reputations with them.'),
          no('Join two jam’iyyas to double up.', 'Two sets of payments can break his tight week.'),
        ],
      },
    ],
    tryIt: 'If you’re in a jam’iyya, add it to the app with members, turn order and pot size, alongside your solo goal.',
    apply: 'has-tontine',
  }),

  // ───────────────────────── Borrow ─────────────────────────
  node({
    id: 'c1-what-is-debt',
    branch: 'borrow',
    order: 1,
    title: 'What a debt really is',
    objective: 'Recognise any debt, formal or informal, as future income already spent.',
    misconception: 'A loan from a friend or a shop isn’t real debt.',
    prereqs: ['a2-money-in-money-out'],
    lesson: [
      'A debt is simple: money you’ll hand over later for something you already got. The bank kind is easy to spot. The quiet kinds hide: a shop taqsit, the 5,000 DA your cousin lent you, the grocer’s notebook with your name in it.',
      'They all do the same thing. They take a slice of next month’s income before next month arrives. That’s not a moral judgement; borrowing can be a smart tool.',
      'But a debt you don’t count is a debt that surprises you. Write down every one: who, how much, by when. Seeing them together is usually less scary than half-remembering them.',
    ],
    quiz: [
      {
        prompt: 'Nadia owes the grocer 3,000 DA, her sister 8,000 DA, and has four shop payments of 4,000 DA left on a phone. How much debt does she have?',
        options: [
          no('None, since she has no bank loan.', 'Shop and family debts still come out of future income.'),
          no('Only the 16,000 DA left on the phone.', 'The grocer and her sister count too.'),
          ok('27,000 DA in total.', '3,000 + 8,000 + 16,000. Every promise to pay counts.'),
          no('Just 4,000 DA, this month’s phone payment.', 'That’s this month’s slice, not the whole debt.'),
        ],
      },
      {
        prompt: 'Walid feels embarrassed writing down that he owes his uncle. What’s the most helpful way to see it?',
        options: [
          no('Leave it off, since family doesn’t count.', 'Leaving it off means it can ambush his budget later.'),
          ok('Write it down as a plan to repay, not a confession.', 'A record is about remembering, not shame.'),
          no('Avoid his uncle until he can pay.', 'Silence tends to strain a relationship more than the debt does.'),
          no('Borrow from a friend to repay his uncle at once.', 'That just moves the debt to a new person.'),
        ],
      },
    ],
    tryIt: 'Record one debt you owe, formal or informal, with who it’s to, how much, and when it’s due.',
    apply: 'has-iou',
  }),
  node({
    id: 'c2-true-cost',
    branch: 'borrow',
    order: 2,
    title: 'The true cost of “pay in 12”',
    objective: 'Compare the total paid on a shop installment or pay-later plan with the cash price.',
    misconception: '“Interest-free” means it costs the same as paying cash.',
    prereqs: ['c1-what-is-debt'],
    lesson: [
      'A shop offers a phone: 60,000 DA cash, or 12 × 6,500 DA “without interest”. Twelve times 6,500 is 78,000. The extra 18,000 DA is 30% on top of the cash price. That’s a cost, whatever the sign calls it.',
      'The useful question is never “is there interest?” It’s “what do I pay in total, and when?” Divide the extra by the cash price: that’s the mark-up.',
      'Compare: 6,500 DA a month in a jar for ten months buys the same phone outright, with money left over. Installments are sometimes right, like a tool that earns you income now. They are never free.',
    ],
    quiz: [
      {
        prompt: 'Hamza sees a phone at 60,000 DA cash, or 12 payments of 6,500 DA. What’s the mark-up?',
        options: [
          no('0%, because it says interest-free.', '“No interest” describes the label, not the price.'),
          ok('30%.', '(78,000 − 60,000) ÷ 60,000.'),
          no('18%.', 'That’s the extra in thousands of DA, not a percentage.'),
          no('6.5%.', 'That mixes up the monthly payment with the cost.'),
        ],
      },
      {
        prompt: 'When might Hamza’s installment plan still be a reasonable choice?',
        options: [
          ok('When he needs the phone now to earn, like for a delivery app, and the payment fits his tight week.', 'A tool that earns can justify a known mark-up.'),
          no('When the seller is his cousin.', 'The relationship doesn’t change the mark-up.'),
          no('Whenever the monthly payment is under 10% of his income.', 'Fit matters, but a 30% mark-up on a want is still a steep price.'),
          no('Whenever his cash would otherwise sit idle.', 'Cash sitting ready has a name: a cushion.'),
        ],
      },
    ],
    tryIt: 'Track one real installment plan in the app with its cash price and payments, and look at the mark-up.',
    apply: 'installment-tracked',
  }),
  node({
    id: 'c3-riba-vs-markup',
    branch: 'borrow',
    order: 3,
    title: 'Riba, mark-up, murabaha',
    objective: 'Tell apart interest on money, a disclosed cost-plus sale (murabaha) and a hidden mark-up.',
    misconception: 'Islamic finance is either always cheaper, or the same thing with a new name.',
    prereqs: ['c2-true-cost'],
    lesson: [
      'Three offers for the same 1,200,000 DA car. A bank loan: you borrow money and repay more money. Interest on money is what most scholars call riba. A murabaha at an Islamic window: the bank buys the car and sells it to you at a higher, disclosed price, fixed up front, paid in instalments. A dealer’s taqsit with no written total.',
      'Islamic doesn’t automatically mean cheaper; murabaha mark-ups often look like bank rates. The difference is structure: a known price for a thing, agreed once.',
      'Whatever your view, ask for the full total in writing before signing. For a ruling on a specific product, ask a scholar you trust.',
    ],
    quiz: [
      {
        prompt: 'Amine is comparing three ways to get a car. Which statement is accurate?',
        options: [
          no('Murabaha is always cheaper than a conventional loan.', 'Costs are often similar; the structure is what differs.'),
          ok('Murabaha is a sale at a disclosed mark-up, agreed up front.', 'The bank sells him the car at a known price.'),
          no('Anything labelled “Islamic” is automatically compliant.', 'Scholars and banks differ. Looking at the structure, and asking a scholar he trusts, beats the label.'),
          no('A shop taqsit with no stated interest is the most halal choice.', 'An undisclosed total is a poor deal on any view.'),
        ],
      },
      {
        prompt: 'Hamza is late on a murabaha instalment. What is he most likely to face?',
        options: [
          no('Interest added every month he’s late.', 'Not under a standard murabaha; any late fee is typically given to charity, though contracts vary.'),
          ok('The agreed price stays fixed, but the bank can still collect or take back the item.', 'The price doesn’t grow, but the debt is still real.'),
          no('The bank forgives it, since Islamic banks don’t collect.', 'They do collect. The debt is owed.'),
          no('The price renegotiated upward for the delay.', 'Raising the price for delay would bring back the very thing murabaha avoids.'),
        ],
      },
    ],
    tryIt: 'Next time you see a loan, murabaha or shop installment offer, note its structure and its full written total.',
    apply: null,
  }),
  node({
    id: 'c4-cash-flow-fit',
    branch: 'borrow',
    order: 4,
    title: 'Does it fit the calendar?',
    objective: 'Test an installment against your money calendar before signing.',
    misconception: 'If the monthly payment is small, it’s fine.',
    prereqs: ['a3-the-calendar', 'c2-true-cost'],
    lesson: [
      'A 4,000 DA monthly payment sounds small. But money doesn’t leave as a monthly average; it leaves on dates. If that 4,000 DA is due on the 25th, and the 25th is already your tight week, small just became impossible.',
      'Before signing, put the payment on your calendar on its real date. Then look at your tightest week. Does it still end above zero, with a little to spare?',
      'If yes, the plan fits, and the only question left is the mark-up. If no, there are options: ask for a different due date, choose a smaller item, or save first and buy in cash.',
    ],
    quiz: [
      {
        prompt: 'Lina’s tight week usually ends at about +2,500 DA. A phone plan asks 3,500 DA a month, due on the 22nd, inside that week. What does the calendar say?',
        options: [
          no('It’s fine; 3,500 DA is small.', 'Small next to her income, but it pushes the tight week to about −1,000 DA.'),
          ok('It doesn’t fit as it is; ask for a due date after payday, or wait.', 'Moving the date or waiting can turn a no into a yes.'),
          no('Sign it and borrow when the 22nd comes.', 'That plans a second debt to pay the first.'),
          no('Only the total matters, not the date.', 'The total sets the cost; the date decides whether she can pay.'),
        ],
      },
      {
        prompt: 'Hamza can pay for the same item at 3,000 DA a month for 12 months, or 5,000 DA a month for 6 months. Both fit his calendar. What’s the next question?',
        options: [
          ok('Which total is lower: 36,000 or 30,000 DA?', 'Once both fit, the cheaper total wins.'),
          no('Which monthly payment is smaller.', 'The smaller payment costs 6,000 DA more overall.'),
          no('Which one the seller recommends.', 'The seller often earns more on the longer plan.'),
          no('Neither, because installments are always bad.', 'Not always. When it fits and the total is fair, it can be reasonable.'),
        ],
      },
    ],
    tryIt: 'Run the decision simulator with the installment you’re considering and see what it does to your months.',
    apply: 'ran-sim',
  }),
  node({
    id: 'c5-owing-to-people',
    branch: 'borrow',
    order: 5,
    title: 'Owing people',
    objective: 'Write down informal debts, agree a date, and repay in visible chunks.',
    misconception: 'Family debts don’t need dates.',
    prereqs: ['c1-what-is-debt'],
    lesson: [
      'Borrowing from family is often the kindest credit there is: no mark-up, no paperwork. Its hidden cost is vagueness. With no date, the debt drifts, and the silence around it grows heavier than the money.',
      'A simple fix keeps the money and the relationship healthy. Agree a date or a rhythm: “2,000 DA every payday until it’s done.” Write it down for yourself. Then pay in visible chunks, even small ones, and say so when you do.',
      'Each payment says: I haven’t forgotten. Lenders who see steady progress are usually happy to wait for the rest.',
    ],
    quiz: [
      {
        prompt: 'Salma owes her aunt 12,000 DA, with no date agreed. What’s the most relationship-friendly move?',
        options: [
          no('Wait until she has the full 12,000 DA.', 'A long silence can feel like forgetting.'),
          ok('Offer 2,000 DA a month for six months, and stick to it.', 'A clear rhythm shows respect and gets it done.'),
          no('Never mention it unless her aunt does.', 'That leaves her aunt to raise an awkward subject.'),
          no('Borrow from a friend to repay it at once.', 'That just moves the debt to someone else.'),
        ],
      },
      {
        prompt: 'One month, Salma can only pay 1,000 DA of the agreed 2,000 DA. What helps?',
        options: [
          no('Skip this month and say nothing.', 'Silence is what strains family loans most.'),
          ok('Pay the 1,000 DA and tell her aunt the rest is coming next month.', 'Partial and honest keeps trust intact.'),
          no('Avoid her aunt until she has 2,000 DA.', 'Avoidance feels worse to a lender than a short payment.'),
          no('Cancel the plan and start over later.', 'One short month doesn’t cancel the plan.'),
        ],
      },
    ],
    tryIt: 'Mark one repayment on a debt you owe as paid in the app, even a small chunk.',
    apply: 'paid-obligation',
  }),
  node({
    id: 'c6-debt-snowball',
    branch: 'borrow',
    order: 6,
    title: 'Clearing in order',
    objective: 'Put several debts in order and send a fixed extra amount to one at a time.',
    misconception: 'Paying a little extra on everything is the fastest way out.',
    prereqs: ['c4-cash-flow-fit', 'c5-owing-to-people'],
    lesson: [
      'With several debts, spreading a little extra on each feels fair but finishes nothing for ages. An order works better.',
      'Two common orders. Smallest first, the snowball: clear the smallest debt, then roll its payment into the next. Each win keeps you going. Costliest first, the avalanche: send the extra to the debt with the biggest mark-up or late fee. It saves the most money.',
      'A no-cost family debt might come last on money but first on peace of mind. That’s a fair choice too. Whatever the order: keep paying the minimum everywhere, and send every extra dinar to one debt.',
    ],
    quiz: [
      {
        prompt: 'Khaled owes a shop 6,000 DA, a friend 15,000 DA and a phone plan 40,000 DA. He has 3,000 DA extra each month. What does smallest-first look like?',
        options: [
          no('1,000 DA extra to each debt.', 'Spread thin, nothing closes for months.'),
          ok('The extra goes to the 6,000 DA shop debt until it’s gone, then on to the friend.', 'Two months to the first win, then the payment rolls on.'),
          no('Everything extra to the 40,000 DA plan.', 'That’s the biggest, not the smallest. A different strategy.'),
          no('Stop the minimums elsewhere to clear one fast.', 'Missed minimums can bring late fees and broken trust.'),
        ],
      },
      {
        prompt: 'Nadia’s phone plan charges late fees; her brother’s loan costs nothing. She cares most about total cost. Where does her extra money go?',
        options: [
          no('Her brother’s loan, to be polite.', 'A fair choice for peace of mind, but not the cheapest.'),
          ok('The phone plan, since it’s the one that can cost more.', 'Costliest first saves the most money.'),
          no('Split evenly between them.', 'Even splits slow both down.'),
          no('Nowhere; minimums are enough.', 'Minimums alone can stretch a debt out for a long time.'),
        ],
      },
    ],
    tryIt: 'Choose your order, then log your first extra payment on the debt at the top of the list.',
    apply: 'paid-obligation',
  }),
  node({
    id: 'c7-credit-later',
    branch: 'borrow',
    order: 7,
    title: 'Formal credit, later',
    objective: 'Know what a consumer loan, a murabaha plan or a microcredit asks for and costs, before you need one.',
    misconception: 'Formal lenders never deal with people like me, or any loan is a trap.',
    prereqs: ['c3-riba-vs-markup', 'c6-debt-snowball'],
    lesson: [
      'Formal credit isn’t only for other people, and it isn’t always a trap. Banks offer consumer loans, Islamic windows offer murabaha plans, and public microcredit schemes support small projects. Each has a price, a structure and a list of papers.',
      'Typical asks: ID, proof of income (a payslip, or some record if you’re self-employed), sometimes a guarantor, and an account with that lender. Typical costs: a rate or mark-up, fees, sometimes insurance.',
      'Learn the shape now, while you don’t need it. Credit taken calmly, for something that earns or truly matters, looks very different from credit grabbed in a crisis. On the religious side, ask a scholar you trust.',
    ],
    quiz: [
      {
        prompt: 'Hamza, a self-employed plumber, needs 300,000 DA of tools that will earn him money. What’s a calm first step?',
        options: [
          no('Assume no lender will talk to him.', 'Some products are designed for the self-employed, and asking costs nothing.'),
          ok('Compare two or three offers by total cost, papers needed and monthly fit.', 'Comparing calmly is the opposite of crisis borrowing.'),
          no('Take the first offer to save time.', 'The first offer is rarely the best one.'),
          no('Borrow small amounts from five friends instead.', 'Five informal loans can be harder to manage than one clear one.'),
        ],
      },
      {
        prompt: 'Lina sees an ad: “Loan approved in one hour, no documents.” What does that suggest?',
        options: [
          no('It’s the best deal around.', 'Speed is usually paid for in cost or risk.'),
          ok('Check the total cost carefully, and who is really lending.', 'Instant approval with no papers is also a common scam shape.'),
          no('It must be an Islamic product.', 'Speed says nothing about structure.'),
          no('All formal loans work like this.', 'Formal lenders usually ask for papers.'),
        ],
      },
    ],
    tryIt: 'Pick one real credit product and note, for later, its papers, total cost and monthly fit.',
    apply: null,
  }),

  // ───────────────────────── Dinar ─────────────────────────
  node({
    id: 'd1-price-of-bread',
    branch: 'dinar',
    order: 1,
    title: 'The price of bread',
    objective: 'Track three everyday prices for three months to feel inflation personally.',
    misconception: 'Inflation is a government number, not my problem.',
    prereqs: ['a1-where-money-goes'],
    lesson: [
      'Inflation is announced as one percentage, but you live it item by item. Your basket isn’t the national average. If you buy lots of chicken, eggs and oil, your personal inflation can be quite different from the headline.',
      'So measure your own. Pick three things you buy often: a kilo of chicken, a tray of eggs, a litre of oil, your usual coffee. Note what you paid this month, then next month, then the month after.',
      'Three months of your own prices tells you more about your budget than any headline. It also tells you which envelope caps need to move.',
    ],
    quiz: [
      {
        prompt: 'Nadia hears that inflation is low this year, but her grocery bill feels much higher. Who’s right?',
        options: [
          no('The headline; her feeling is wrong.', 'Her own basket can rise faster than the average.'),
          no('Her feeling; the headline is made up.', 'Both can be true: an average and a personal basket differ.'),
          ok('Possibly both, and tracking her own prices will show her real rate.', 'Measuring her basket settles it for her budget.'),
          no('Neither; prices don’t really change.', 'Prices do move, just unevenly.'),
        ],
      },
      {
        prompt: 'Walid wants a personal price-watch. Which three items work best?',
        options: [
          no('A car, a fridge and a flat.', 'He rarely buys those, so there’s nothing to compare month to month.'),
          ok('Things he buys every week: eggs, chicken and his bus fare.', 'Frequent buys show change fastest.'),
          no('Whatever happens to be on sale this week.', 'Sale prices hide the real trend.'),
          no('Only imported items.', 'Local items matter too; they’re most of his spending.'),
        ],
      },
    ],
    tryIt: 'Log your next purchase of a staple with its exact price, and log the same item again next month.',
    apply: 'log-any',
  }),
  node({
    id: 'd2-two-rates',
    branch: 'dinar',
    order: 2,
    title: 'Two rates, one dinar',
    objective: 'Explain the official and parallel euro rates, and why imported goods follow the parallel one.',
    misconception: 'The official rate is the only “real” one, and the Square rate is cheating.',
    prereqs: ['d1-price-of-bread'],
    lesson: [
      'Why does a 500-euro phone cost far more in Algiers than 500 times the bank rate? Because the importer bought euros on the parallel market, at Square, not at the bank.',
      'Two rates live side by side. The official rate covers banks and the limited travel allowance. The parallel rate covers almost everything else. Lately the parallel euro has cost close to double the official one, but both move, so check today’s rates.',
      'Imported phones, car parts and a diaspora cousin’s “I’ll send you 100 euros” all follow the parallel rate. Knowing which rate applies tells you whether a price is honest. Neither rate is “the lie”; they answer different questions.',
    ],
    quiz: [
      {
        prompt: 'Your aunt in Marseille sends 200 euros through a friend who pays you in dinars. Say the bank rate is about 150 DA and today’s Square rate about 280 DA. What’s a fair amount?',
        options: [
          no('About 30,000 DA.', 'That’s the bank rate, and nobody swaps cash at it on the street.'),
          ok('About 56,000 DA.', '200 × 280: what the euros would actually fetch today.'),
          no('About 45,000 DA.', 'A rate in between isn’t on offer anywhere; this would shortchange you.'),
          no('Whatever the friend offers.', 'Knowing today’s rate first keeps the deal fair for both.'),
        ],
      },
      {
        prompt: 'Amine notices some prices climbing faster than others. Which of these follows the parallel rate most closely?',
        options: [
          no('A baguette.', 'Bread is local, and its price is regulated.'),
          no('A city bus ticket.', 'Local and subsidised; it doesn’t track the euro.'),
          ok('An imported laptop.', 'Imported goods are priced from euros bought at Square.'),
          no('His social-security contribution.', 'Set in dinars by law.'),
        ],
      },
    ],
    tryIt: 'Set today’s Square and bank euro rates in the app, and update them whenever they move.',
    apply: 'fx-set',
  }),
  node({
    id: 'd3-cash-loses-value',
    branch: 'dinar',
    order: 3,
    title: 'Cash loses value',
    objective: 'Work out what a sum of cash buys after one and three years at a chosen inflation rate.',
    misconception: 'Cash is always safe.',
    prereqs: ['d1-price-of-bread'],
    lesson: [
      'Hide 100,000 DA under the mattress. Three years later it still says 100,000 DA. But if prices rose 9% a year, it now buys only about what 77,000 DA buys today. Nothing was stolen; prices moved.',
      'That’s the quiet cost of cash. The number on the note stays the same while what it buys shrinks, so the loss is invisible.',
      'The answer isn’t panic-buying euros. Keep the emergency cushion in cash or close to it, since reachability matters most there. For longer goals, look at options that tend to hold value over time, or buy the goal sooner. And re-check envelope caps when prices move.',
    ],
    quiz: [
      {
        prompt: 'Walid keeps 100,000 DA at home for three years while prices rise 9% a year. Roughly what does it buy at the end, in today’s money?',
        options: [
          no('100,000 DA worth; nothing changed.', 'The note didn’t change; prices did.'),
          ok('About 77,000 DA worth.', '100,000 ÷ 1.09³. Each year’s rise builds on the last.'),
          no('About 73,000 DA worth.', 'That subtracts 9% three times in a straight line; close, but the rises compound.'),
          no('More, because the dinar is backed by oil.', 'Oil reserves don’t stop shop prices rising.'),
        ],
      },
      {
        prompt: 'Which part of Walid’s money makes most sense to keep in cash anyway?',
        options: [
          no('All of it, because cash is safe.', 'It quietly loses buying power every year.'),
          ok('The emergency cushion.', 'For a cushion, being reachable matters more than growing.'),
          no('None; convert it all to euros.', 'Large euro cash brings theft risk, exchange costs and legal limits.'),
          no('Only the money for goals more than five years away.', 'Backwards: long-term money is the part most exposed to rising prices.'),
        ],
      },
    ],
    tryIt: 'Work out what your cushion would buy in three years at a rate you choose, and note the gap.',
    apply: null,
  }),
  node({
    id: 'd4-budget-in-real-terms',
    branch: 'dinar',
    order: 4,
    title: 'Real-terms budget',
    objective: 'Adjust envelope caps when prices move, instead of quietly overspending.',
    misconception: 'My budget is fixed in dinars.',
    prereqs: ['a5-cash-envelopes', 'd1-price-of-bread'],
    lesson: [
      'Your food envelope was 18,000 DA in January. By summer, the same basket costs 20,000. If the envelope stays at 18,000, one of two things happens: you quietly overspend and feel bad, or you quietly eat less and feel worse.',
      'A real-terms budget follows prices. When your price-watch shows a jump, raise the cap on purpose, and take the difference from somewhere visible: a want envelope, a slower goal, a smaller treat.',
      'That’s not failing your budget. It’s keeping it true. A plan that ignores prices stops describing your life, and people stop using plans that don’t describe their life.',
    ],
    quiz: [
      {
        prompt: 'Lina’s price-watch shows her groceries up about 10% since spring. Her food envelope is still 20,000 DA. What fits?',
        options: [
          no('Keep it at 20,000 DA and try harder.', 'Same dinars, smaller basket. Willpower doesn’t change prices.'),
          ok('Raise it to about 22,000 DA and trim 2,000 DA from a want envelope.', 'The change is honest and the tradeoff is visible.'),
          no('Stop tracking prices, since it’s depressing.', 'Prices rise either way; tracking just lets her plan.'),
          no('Put groceries on credit for now.', 'Debt doesn’t lower prices; it delays the bill.'),
        ],
      },
      {
        prompt: 'Hamza’s rent share just went up by 3,000 DA a month. Which update keeps his plan honest?',
        options: [
          ok('Update his essentials and see which goal slows down.', 'Changes in essentials ripple through the plan; seeing them helps.'),
          no('Change nothing and hope it balances out.', 'It won’t, and he’ll feel it in the tight week.'),
          no('Cancel all his savings.', 'A 3,000 DA change rarely needs that much.'),
          no('Borrow 3,000 DA each month.', 'That turns rent into a debt.'),
        ],
      },
    ],
    tryIt: 'When a price you track jumps, update your monthly essentials in your profile to match.',
    apply: 'profile-set',
  }),
  node({
    id: 'd5-fx-decisions',
    branch: 'dinar',
    order: 5,
    title: 'Dinar or euro?',
    objective: 'Decide when holding some savings in euros makes sense, and weigh its risks.',
    misconception: 'Keeping all savings in euros is always the smart move.',
    prereqs: ['d2-two-rates', 'b3-where-to-keep-it'],
    lesson: [
      'Many families keep some savings in euros, and it can make sense when the goal itself is priced in euros: travel, study abroad, an imported tool. Euros track those costs better than dinars do.',
      'But euros come with tradeoffs. Cash at home can be stolen. Every buy and sell at Square costs a spread. Rates swing both ways. And there are legal limits on holding and moving currency.',
      'One balanced approach: match the currency to the goal. Dinar goals stay in dinars. A euro goal can be held partly in euros, kept safely, and bought gradually rather than all at once. Write down your reason, so it’s a plan rather than a reflex.',
    ],
    quiz: [
      {
        prompt: 'Khaled is saving for a 1,000-euro course in France next year. His cousin says to convert all his savings to euros, cushion included. What fits?',
        options: [
          no('Convert everything; the euro always wins.', 'His cushion pays dinar bills; converting it adds cost and risk.'),
          ok('Hold the course money partly in euros, bought gradually, and keep the cushion in dinars.', 'Each pot matches the currency it will be spent in.'),
          no('Never touch euros; it’s always wrong.', 'For a euro-priced goal, some euros can lower his risk.'),
          no('Buy all the euros the day before he leaves.', 'One big buy means taking whatever rate that day offers.'),
        ],
      },
      {
        prompt: 'Yasmine is saving a 150,000 DA contribution for a family wedding in Oran. Which currency fits that goal?',
        options: [
          ok('Dinars, because the cost is in dinars.', 'No mismatch, and no spread to pay.'),
          no('Euros, because they’re stronger.', 'She’d pay the spread twice and face rate swings for a dinar cost.'),
          no('Gold, always.', 'Gold has its own buy-sell costs and swings.'),
          no('Half and half, by default.', 'A rule with no link to the goal is just a guess.'),
        ],
      },
    ],
    tryIt: 'For any euro-priced goal, write down why it’s in euros and how you’ll keep it safe.',
    apply: null,
  }),
  node({
    id: 'd6-wage-vs-prices',
    branch: 'dinar',
    order: 6,
    title: 'Is my raise a raise?',
    objective: 'Compare an income change with price changes to see whether your buying power rose.',
    misconception: 'More dinars always means I’m better off.',
    prereqs: ['d3-cash-loses-value'],
    lesson: [
      'Your pay goes from 40,000 to 44,000 DA. That’s 10% more dinars. Did your life get 10% better?',
      'Only if prices stood still. If your personal basket rose 6% over the same time, your real raise is about 4%. If it rose 12%, you’re slightly worse off, even with more dinars in hand.',
      'This isn’t about spoiling good news. It’s about planning with the right number. A real raise is room to save more or loosen a want envelope. A raise that only keeps up is welcome, but it isn’t new money, so the plan stays as it is.',
    ],
    quiz: [
      {
        prompt: 'Salma’s income rose from 50,000 to 55,000 DA. Her price-watch shows her basket up about 10%. What happened to her buying power?',
        options: [
          no('Up 10%.', 'That’s the dinars, not what they buy.'),
          ok('Roughly flat.', 'A 10% raise against 10% higher prices buys about the same.'),
          no('Down 10%.', 'She kept pace; she didn’t lose ground.'),
          no('Impossible to say.', 'Her own price-watch gives a good enough answer.'),
        ],
      },
      {
        prompt: 'Amine’s pay rose 15% while his basket rose about 5%. What’s a sensible use of the real gain?',
        options: [
          no('Spend all of it, since it’s a raise.', 'Some fun is fine, but none of it moves his goals.'),
          ok('Split the real gain between a goal and a want.', 'Real new room, used on purpose.'),
          no('Ignore it until next year.', 'Money with no job tends to drift.'),
          no('Change nothing, in case prices catch up.', 'Possible, but he can plan with today’s numbers and adjust later.'),
        ],
      },
    ],
    tryIt: 'When your income changes, update it in your profile and compare the change with your price-watch.',
    apply: 'profile-set',
  }),

  // ───────────────────────── Earn ─────────────────────────
  node({
    id: 'e1-map-your-income',
    branch: 'earn',
    order: 1,
    title: 'Map your income',
    objective: 'List every income source with its rhythm and how reliable it is.',
    misconception: 'I only have one income.',
    prereqs: ['a2-money-in-money-out'],
    lesson: [
      'Ask how someone earns, and the first answer is one job. Ask again and the real list appears: the job, weekend deliveries, a cousin’s shop on Fridays, help from parents, some tutoring, maybe an unemployment allowance.',
      'Each source has a rhythm (weekly, monthly, whenever) and a reliability (solid, usually, maybe). Mapping them shows what you can count on and what’s a bonus.',
      'It also shows risk. If most of your money comes from one place, losing it would hurt badly. Two smaller reliable sources can feel safer than one big shaky one. You can’t plan with income you haven’t named.',
    ],
    quiz: [
      {
        prompt: 'Walid earns from a call-centre contract, weekend deliveries and occasional help from his father. How many income sources does he have?',
        options: [
          no('One: the contract.', 'The others are smaller, but they’re real money coming in.'),
          ok('Three, each with its own rhythm and reliability.', 'Naming all three shows what he can count on.'),
          no('Two, since family help doesn’t count.', 'Family support is income too, when it arrives.'),
          no('None, since none are fully reliable.', 'Unreliable isn’t absent; it just gets a lower rating.'),
        ],
      },
      {
        prompt: 'Lina’s deliveries bring 2,000–8,000 DA a week; her tutoring pays 12,000 DA every month without fail. Which is more reliable?',
        options: [
          no('Deliveries, because they can be bigger.', 'Bigger on good weeks, but harder to count on.'),
          ok('Tutoring: a steady amount on a steady rhythm.', 'Steady beats big when covering essentials.'),
          no('They’re the same.', 'Both are income, with very different predictability.'),
          no('Neither; only salaries count.', 'Any steady source can be planned with.'),
        ],
      },
    ],
    tryIt: 'Log one income from each of your sources this month, so the app sees them all.',
    apply: 'log-any',
  }),
  node({
    id: 'e2-irregular-income-budget',
    branch: 'earn',
    order: 2,
    title: 'Budgeting on an irregular income',
    objective: 'Budget essentials from your lowest recent month and send good-month surplus to set jobs.',
    misconception: 'Budget from your average month.',
    prereqs: ['e1-map-your-income', 'a8-breathing-room'],
    lesson: [
      'Salma does freelance design: 90,000 DA one month, 20,000 the next. Budgeting on the average (55,000) means overspending every lean month, then borrowing.',
      'The fix: plan essentials on the lowest of your last three months, here 20,000. Anything above it is surplus with three jobs, in order: top up the cushion, fund sinking goals, then spend.',
      'In a good month the surplus jar fills. In a lean month she lives on the baseline plus a planned draw from that jar. It’s the feeling of a salary, without having one.',
    ],
    quiz: [
      {
        prompt: 'Salma’s last three months brought 90,000, 20,000 and 55,000 DA. What baseline does she use for essentials?',
        options: [
          no('55,000 DA.', 'That’s the average, and it breaks in a 20,000 DA month.'),
          ok('20,000 DA.', 'The lowest month: the plan survives even a lean one.'),
          no('90,000 DA.', 'The best case, and a painful one to plan on.'),
          no('Whatever this month brings.', 'That’s no plan at all.'),
        ],
      },
      {
        prompt: 'In her 90,000 DA month, what happens to the 70,000 DA above her baseline?',
        options: [
          no('It’s spending money; she earned it.', 'The next lean month would feel that.'),
          ok('Cushion first, then sinking goals, then spending.', 'A fixed order turns a good month into a calm next month.'),
          no('Convert it all to euros.', 'One tactic, not a system for lean months.'),
          no('Lend it to friends while she doesn’t need it.', 'She very likely will need it next month.'),
        ],
      },
    ],
    tryIt: 'Set your monthly income in your profile to the lowest of your last three months.',
    apply: 'profile-set',
  }),
  node({
    id: 'e3-price-your-work',
    branch: 'earn',
    order: 3,
    title: 'Price your work',
    objective: 'Work out a minimum hourly rate for gig or freelance work, including hidden time and costs.',
    misconception: 'Any paid work is worth taking.',
    prereqs: ['e1-map-your-income'],
    lesson: [
      'A client offers 3,000 DA for a logo. Sounds fine. Then add it up: four hours of design, two of revisions, one of messages, 400 DA of data and a 200 DA taxi to meet them. Seven hours, 600 DA of costs. You earned about 340 DA an hour.',
      'Your floor rate is the lowest hourly amount worth your time after costs. Count every hour, including unpaid ones like travel, waiting and back-and-forth. Subtract every cost.',
      'Below the floor, you can still say yes, for experience or a good contact. But now you know it’s a trade, not a wage.',
    ],
    quiz: [
      {
        prompt: 'Hamza is offered 5,000 DA for a job: 5 hours of work, 2 hours of travel, and 1,000 DA in transport. What’s his real hourly rate?',
        options: [
          no('1,000 DA an hour.', 'That ignores the travel time and the transport cost.'),
          ok('About 570 DA an hour.', '(5,000 − 1,000) ÷ 7 hours.'),
          no('5,000 DA an hour.', 'That’s the whole fee counted as one hour.'),
          no('It doesn’t matter; work is work.', 'Some jobs cost more than they pay once everything is counted.'),
        ],
      },
      {
        prompt: 'Salma’s floor is 600 DA an hour. A job pays 400 DA an hour, but it’s from a big local business that could send more work. What’s reasonable?',
        options: [
          no('Refuse anything below the floor, always.', 'Rules are tools; some trades are worth making.'),
          ok('Take it once, on purpose, as an investment, and quote her real rate next time.', 'A conscious exception, with a plan to get back to her rate.'),
          no('Take it and lower her floor to 400 DA.', 'One client doesn’t get to reset what her time is worth.'),
          no('Take every job at any rate.', 'That fills her hours and empties her week.'),
        ],
      },
    ],
    tryIt: 'Work out your floor rate from your last job: fee minus costs, divided by every hour it took.',
    apply: null,
  }),
  node({
    id: 'e4-getting-paid-safely',
    branch: 'earn',
    order: 4,
    title: 'Getting paid safely',
    objective: 'Choose how each client pays you, knowing the fees and risks of each channel.',
    misconception: 'Cash is always the simplest way to get paid.',
    prereqs: ['e1-map-your-income', 'g2-your-ccp-is-your-vault'],
    lesson: [
      'Cash is instant and free, but it can vanish, leaves no record, and invites “I’ll pay you next week”. CCP and BaridiMob transfers leave a trail and keep money off your body. Foreign platforms paid through someone else’s account bring fees, rate questions and a big dependence on that person.',
      'Pick the channel per client. A new client: half up front, or payment before handover. A trusted regular: whatever is easiest for both.',
      'Two habits for every channel. Share your account number freely, never your codes. And log each payment the day it lands, with the channel and any fee.',
    ],
    quiz: [
      {
        prompt: 'Nadia’s new client wants the finished logo first and promises to pay “after”. What’s a safe setup?',
        options: [
          no('Agree, since asking for money is rude.', 'Agreeing terms up front is professional, not rude.'),
          ok('Ask for half up front by CCP, and the rest before handing over the final files.', 'Both sides carry part of the risk.'),
          no('Send him her card code so he can pay faster.', 'Receiving money never needs a code, only an account number.'),
          no('Insist on cash only.', 'Cash is fine, but on its own it doesn’t solve the trust problem.'),
        ],
      },
      {
        prompt: 'Khaled gets paid for online work through a friend’s foreign account, and the friend pays him in dinars. What’s the main thing to track?',
        options: [
          no('Nothing, since it’s his friend.', 'Friendship doesn’t remove fees or rate questions.'),
          ok('The fee and the rate his friend uses, logged with each payment.', 'Then he can see what each job really earned.'),
          no('Only the yearly total.', 'Per-payment notes show whether the rate is fair.'),
          no('Switch to cash so it’s simpler.', 'A foreign client can’t hand him cash.'),
        ],
      },
    ],
    tryIt: 'Log your next income with its channel in the note, plus any fee you paid to receive it.',
    apply: 'log-any',
  }),
  node({
    id: 'e5-informal-to-formal',
    branch: 'earn',
    order: 5,
    title: 'Formal when it pays',
    objective: 'Weigh when registering your activity, for example as an auto-entrepreneur, is worth the cost.',
    misconception: 'Registering only means paying tax.',
    prereqs: ['e3-price-your-work'],
    lesson: [
      'A lot of work in Algeria is informal. That’s a reality, not a crime story. But at some point, registering can start to pay for itself.',
      'On the cost side: social contributions, some tax, paperwork. On the benefit side: invoicing companies, signing contracts, bidding for public work, social-security cover, a pension record, sometimes access to financing.',
      'Statuses designed for small activities, like auto-entrepreneur, keep costs lower. Rules change, so check the current ones with an official office. The question isn’t “is registering good?” It’s “for my activity, this year, do the doors it opens outweigh the cost?”',
    ],
    quiz: [
      {
        prompt: 'Salma’s design clients are now companies asking for invoices. What changes for her?',
        options: [
          no('Nothing; informal is always cheaper.', 'Not if it costs her the clients who need invoices.'),
          ok('Registering may now pay for itself, by keeping those clients.', 'The benefit side just got bigger.'),
          no('She has to register today or face serious trouble.', 'Fear isn’t a plan. She can check the real rules calmly.'),
          no('Companies don’t really care about invoices.', 'Many need them for their own books.'),
        ],
      },
      {
        prompt: 'Walid does small weekend repairs for neighbours, about 10,000 DA a month. What’s a reasonable view?',
        options: [
          no('He has to register right away.', 'For small, occasional work, the cost may outweigh the benefit for now.'),
          ok('Note the costs and benefits, and look again if the work grows.', 'A decision for now, with a trigger to re-check.'),
          no('Registering would only mean paying tax.', 'It can also bring cover, contracts and a pension record.'),
          no('Never think about it again.', 'Situations change, and a yearly look is cheap.'),
        ],
      },
    ],
    tryIt: 'List what registering would cost you and which doors it would open for your own activity, then note your decision.',
    apply: null,
  }),
  node({
    id: 'e6-income-shock-plan',
    branch: 'earn',
    order: 6,
    title: 'When income stops',
    objective: 'Write a 30-day plan for a month with zero income.',
    misconception: 'I’ll figure it out when it happens.',
    prereqs: ['b7-three-months', 'e2-irregular-income-budget'],
    lesson: [
      'A contract ends. The delivery app cuts your area. You’re ill for three weeks. A zero-income month is common, and it’s far easier to plan for while you’re calm.',
      'A shock plan answers four questions. Which envelopes shrink, and to what? Which bills can wait, and who do you call about them? What could you sell or earn quickly? Who could you ask, and for how much?',
      'Write it down now. Then if that month comes, you aren’t deciding in a panic; you’re following your own instructions. The cushion buys you time. The plan tells you what to do with it.',
    ],
    quiz: [
      {
        prompt: 'Amine’s contract ends with two weeks’ notice. Which first step fits a shock plan?',
        options: [
          no('Keep spending normally until the cushion runs out.', 'Shrinking flexible spending early stretches the cushion.'),
          ok('Shrink want envelopes to near zero, keep essentials, and talk to his landlord early.', 'Early, calm moves buy him weeks.'),
          no('Take a loan right away to keep life the same.', 'That adds a monthly payment just as income stops.'),
          no('Wait and see what happens.', 'Waiting spends the time the cushion bought.'),
        ],
      },
      {
        prompt: 'Nadia’s shock plan includes people she could ask for help. What makes that part work?',
        options: [
          no('Never asking anyone, since it’s shameful.', 'Asking as part of a plan isn’t shameful; it’s prepared.'),
          ok('Names, a rough amount, and how she’d repay.', 'A specific ask is easier to say yes to.'),
          no('Asking everyone she knows at once.', 'A broadcast ask strains many relationships at the same time.'),
          no('Only asking once the rent is already late.', 'Asking before the crisis gives people time to help.'),
        ],
      },
    ],
    tryIt: 'Run the simulator on a month with zero income and note which costs you’d shrink first.',
    apply: 'ran-sim',
  }),

  // ───────────────────────── Family ─────────────────────────
  node({
    id: 'f1-the-family-line',
    branch: 'family',
    order: 1,
    title: 'The family line',
    objective: 'Plan family contributions as a regular category instead of a surprise.',
    misconception: 'Family money is unpredictable, so it can’t be planned.',
    prereqs: ['a3-the-calendar'],
    lesson: [
      'For many young Algerians, giving to family isn’t an extra. It’s part of life: a rent share to parents, help with a younger sibling’s school, something for a grandmother each month.',
      'These amounts are often more predictable than they feel. Look back over three months and you’ll usually find a pattern: a fixed share, plus some regular smaller help.',
      'Put that pattern in the plan as its own line, with its date, just like rent. It changes the feeling. Family giving stops being the thing that wrecked your month, and becomes something you planned for and can be proud of.',
    ],
    quiz: [
      {
        prompt: 'Lina gives her mother around 6,000 DA on most paydays, plus extra for Ramadan. How can she plan for it?',
        options: [
          no('She can’t; family is unpredictable.', 'Three months of logs will usually show a clear pattern.'),
          ok('A 6,000 DA monthly family line, plus a Ramadan sinking fund.', 'The regular part and the seasonal part each get a place.'),
          no('Give only when money is left over.', 'That turns a priority into an afterthought, which rarely matches her values.'),
          no('Stop giving, to make budgeting easier.', 'The plan serves her values, not the other way round.'),
        ],
      },
      {
        prompt: 'Hamza says putting family help in a budget makes it feel cold. What’s another way to see it?',
        options: [
          no('He’s right; family and budgets don’t mix.', 'Planning can protect giving instead of squeezing it.'),
          ok('Planning it means it’s always protected, never the thing that gets cut first.', 'A planned line is a commitment, and a warm one.'),
          no('Hide it under “miscellaneous”.', 'Hiding it makes it look like a surprise again.'),
          no('Give only in cash so it’s never tracked.', 'Cash or not, it’s still part of his month.'),
        ],
      },
    ],
    tryIt: 'Add your regular family contribution as a monthly obligation with its usual date.',
    apply: 'has-obligation',
  }),
  node({
    id: 'f2-saying-yes-with-limits',
    branch: 'family',
    order: 2,
    title: 'Saying yes, with a limit',
    objective: 'Set a monthly limit for unplanned requests and keep a kind script for going beyond it.',
    misconception: 'Refusing family is always shameful.',
    prereqs: ['f1-the-family-line', 'a6-the-48h-rule'],
    lesson: [
      'Requests come: a cousin’s phone bill, a friend short on rent, a sibling’s outing. Saying yes feels good and is often right. Saying yes to everything can empty the month, and the cushion with it.',
      'A limit helps both sides. Decide in advance how much you can give to unplanned requests this month, say 5,000 DA. Inside it, say yes freely. Once it’s used, a kind script is ready: “This month I’ve given what I can. Next month I can help with some.”',
      'That isn’t refusing the person. It’s being honest about the month. Many people find a limit makes their yes more generous, not less.',
    ],
    quiz: [
      {
        prompt: 'Yasmine set a 4,000 DA limit for requests and has already given 3,000 DA. Her cousin asks for 2,500 DA. What fits?',
        options: [
          no('Give the 2,500 DA; family comes first.', 'That breaks the limit she set for exactly this moment.'),
          ok('Offer 1,000 DA now, and say more may be possible next month.', 'Generous within her limit, honest about the rest.'),
          no('Say no and avoid him for a while.', 'A kind partial yes keeps the relationship warm.'),
          no('Take it from her emergency fund.', 'The cushion is for her own emergencies.'),
        ],
      },
      {
        prompt: 'Yasmine’s limit is used up and a friend asks for help. Which wording is kind and honest?',
        options: [
          no('“You always ask me.”', 'Blame tends to start an argument.'),
          ok('“I’ve given what I can this month, but I can help a bit next month.”', 'Warm, true, and it keeps a door open.'),
          no('“I have no money at all.”', 'If it isn’t true, it can damage trust later.'),
          no('Not replying.', 'Silence can hurt more than a gentle no.'),
        ],
      },
    ],
    tryIt: 'Make a jar for unplanned family and friend requests with a monthly amount, and log the next request against it.',
    apply: 'has-jar',
  }),
  node({
    id: 'f3-tontine-mechanics',
    branch: 'family',
    order: 3,
    title: 'How a jam’iyya works',
    objective: 'Model a rotating pot: early turns, late turns, and what happens if someone stops paying.',
    misconception: 'A jam’iyya is always a good deal for everyone in it.',
    prereqs: ['b2-first-10000'],
    lesson: [
      'Ten colleagues put 10,000 DA a month into a pot; each month one takes 100,000. Nobody earns interest, which is why many scholars see it as permissible; ask one you trust if it matters to you.',
      'But the pot isn’t neutral. Turn 1 gets what works like a 90,000 DA interest-free loan. Turn 10 is pure forced saving, with the risk that someone stops paying first.',
      'A jam’iyya is great for people who struggle to save alone and trust the group. It’s risky when the organiser is unknown or the payment strains the tight week. Ask: who organises, what if someone drops out, and which turn am I?',
    ],
    quiz: [
      {
        prompt: 'In a ten-person jam’iyya, which member is taking the most risk?',
        options: [
          no('Turn 1.', 'She got the money first; the rest of the group carries the risk on her.'),
          ok('Turn 10.', 'She pays nine times before collecting, so any dropout hits her.'),
          no('The organiser.', 'Usually more hassle than money at stake.'),
          no('Nobody, since they’re all friends.', 'Friendship helps a lot, but it isn’t a promise.'),
        ],
      },
      {
        prompt: 'A 10,000 DA monthly payment would leave Nadia’s tight week at −2,000 DA. What fits?',
        options: [
          no('Join; the pot will help later.', 'A negative tight week means borrowing in order to save, which goes in circles.'),
          ok('Join a smaller pot, like 5,000 DA, or wait a cycle until the calendar fits.', 'The jam’iyya works best when the payment fits.'),
          no('Join and skip a month if needed.', 'Skipping hurts the group and her standing in it.'),
          no('Take turn 1 to cover the gap.', 'An early turn is a loan; the payments still don’t fit.'),
        ],
      },
    ],
    tryIt: 'Add your real or planned jam’iyya to the app with its members, turn order and pot size.',
    apply: 'has-tontine',
  }),
  node({
    id: 'f4-lending-to-friends',
    branch: 'family',
    order: 4,
    title: 'Lending to friends',
    objective: 'Lend only what you can afford to lose, agree a date, and write it down.',
    misconception: 'Writing a loan down means I don’t trust them.',
    prereqs: ['c5-owing-to-people'],
    lesson: [
      'A friend needs 10,000 DA. Lending can be a real kindness. Lending carelessly can cost both the money and the friend.',
      'Three habits help. Lend only what you could live without if it never came back; if losing it would break your month, a smaller amount may be kinder to you both. Agree a date out loud: “Back by the 15th?” And write it down, for yourself.',
      'Writing debts down is an old tradition, advised in the Qur’an’s longest verse. It isn’t an insult. It protects the friendship from the most common lending problem: two people remembering two different numbers.',
    ],
    quiz: [
      {
        prompt: 'Khaled has 15,000 DA spare. A friend asks for 12,000 DA “for a few weeks”. What’s a careful approach?',
        options: [
          no('Lend it with no date, since dates are awkward.', 'No date is how loans quietly turn into resentment.'),
          ok('Lend an amount he could live without, agree a date, and note it down.', 'Kind and clear at the same time.'),
          no('Lend it and charge 10% to make it worth it.', 'Interest on a personal loan is riba in mainstream Islamic views, and it can sour a friendship.'),
          no('Refuse, because friends and money never mix.', 'Lending can be a real kindness when it fits.'),
        ],
      },
      {
        prompt: 'The agreed date passes and Khaled’s friend says nothing. What’s a gentle next step?',
        options: [
          no('Post about it publicly.', 'Public shame tends to end friendships and rarely brings money back.'),
          ok('A private, friendly reminder, and an offer to split it into smaller payments.', 'Easy to say yes to, and it saves face.'),
          no('Never mention it.', 'Silence makes the debt heavier for both of them.'),
          no('Keep something of his until he pays.', 'That escalates things fast.'),
        ],
      },
    ],
    tryIt: 'Record a loan you’ve made to someone, with the amount and the date you agreed.',
    apply: 'has-iou',
  }),
  node({
    id: 'f5-zakat-sadaqa',
    branch: 'family',
    order: 5,
    title: 'Zakat and sadaqa in the plan',
    objective: 'Understand the basic idea of zakat (nisab, one lunar year, 2.5%) and make room for sadaqa in the budget.',
    misconception: 'Zakat is only for the rich, or only something to think about in Ramadan.',
    prereqs: ['b5-goal-math'],
    lesson: [
      'Zakat is one of the pillars of Islam, and many people would rather plan for it than scramble. The broad idea is widely known. If your savings stay at or above a threshold called nisab for one full lunar year, a share is due, commonly cited as 2.5%. Nisab is tied to the value of gold or silver, and a figure is announced each year.',
      'Details vary: which assets count, debts, jewellery, when the year starts. Those are questions for a scholar you trust, not for an app.',
      'Sadaqa is voluntary giving: any amount, any time. A small sadaqa line in the budget means generosity never has to compete with rent.',
    ],
    quiz: [
      {
        prompt: 'Walid’s savings recently passed what he believes is this year’s nisab. What’s a careful next step?',
        options: [
          no('Pay 2.5% of everything today.', 'The commonly cited view counts a full lunar year above nisab first, and the details are worth checking.'),
          ok('Note the date, keep tracking, and check the details with a scholar he trusts.', 'The lunar year and what counts are exactly the questions to ask.'),
          no('Ignore it, since zakat is only for the rich.', 'It concerns anyone whose savings stay above nisab for a lunar year.'),
          no('Wait until Ramadan and guess an amount.', 'Many people do give in Ramadan, but a guess can be off in either direction.'),
        ],
      },
      {
        prompt: 'Lina wants to give sadaqa regularly, but the money always seems to run out first. What fits?',
        options: [
          ok('A small sadaqa line in the budget, funded on payday.', 'Planned giving doesn’t have to compete with month-end leftovers.'),
          no('Give only if something is left at month end.', 'Month end usually leaves very little.'),
          no('Give nothing until she’s wealthy.', 'Sadaqa has no minimum; small, regular gifts count.'),
          no('Borrow so she can give more.', 'Most people see giving as coming from what you have, not from debt.'),
        ],
      },
    ],
    tryIt: 'Open the zakat helper in the app to walk through the idea step by step, and set up a small sadaqa line.',
    apply: 'used-zakat',
  }),
  node({
    id: 'f6-shared-household',
    branch: 'family',
    order: 6,
    title: 'One house, many wallets',
    objective: 'Agree a clear split of shared household costs with family, a partner or roommates.',
    misconception: 'Whoever has money that week pays.',
    prereqs: ['f1-the-family-line'],
    lesson: [
      'Three siblings in one flat, a young couple, or you and your parents: shared homes run on shared money. Without a rule, the bills land on whoever has cash that week, and that person quietly starts to resent it.',
      'A split rule fixes that. It can be equal (everyone pays a third), by income (higher earners pay more), or by item (one pays internet, one pays gas). None is the right one. The right one is the one everybody agreed to out loud.',
      'Write down the rule, the amounts and the dates. Revisit it when someone’s income changes. Clear money makes for calmer homes.',
    ],
    quiz: [
      {
        prompt: 'Amine earns 60,000 DA and his sister 30,000 DA. Their shared costs are 30,000 DA a month. Which split follows their incomes?',
        options: [
          no('15,000 DA each.', 'That’s an equal split, a fair choice too, but not by income.'),
          ok('Amine 20,000 DA, his sister 10,000 DA.', 'He earns two-thirds of the total, so he pays two-thirds.'),
          no('Whoever has cash pays.', 'That’s the no-rule rule that breeds resentment.'),
          no('Amine pays all of it.', 'Possible as a gift, but it isn’t a split.'),
        ],
      },
      {
        prompt: 'Roommates Salma and Lina split everything equally. Lina loses her job. What helps?',
        options: [
          no('Keep the split; a rule is a rule.', 'Rules can be revisited when life changes.'),
          ok('Agree a temporary split together, with a date to review it.', 'Clear, kind and time-limited.'),
          no('Salma quietly pays more and says nothing.', 'Silent covering tends to build resentment.'),
          no('Lina borrows to keep paying half.', 'Debt to keep an old split rarely helps anyone.'),
        ],
      },
    ],
    tryIt: 'Add your share of the household costs as a monthly obligation, using the split you agreed.',
    apply: 'has-obligation',
  }),
  node({
    id: 'f7-big-events',
    branch: 'family',
    order: 7,
    title: 'Weddings, funerals, Eid',
    objective: 'Plan big social spending ahead, and separate the cultural minimum from the pressure extras.',
    misconception: 'You can’t plan for a wedding; you just borrow.',
    prereqs: ['b4-sinking-funds', 'f2-saying-yes-with-limits'],
    lesson: [
      'Weddings, the Eid sheep, a newborn’s gifts, a family funeral. These moments matter, and they cost. Most are known months ahead, yet they still get paid for with loans.',
      'Two tools help. A sinking fund: list the year’s expected events, put a rough price on each, divide by the months left. And two columns: the cultural minimum, what you’d feel wrong not doing, and the pressure extras, what you’d do only because others do.',
      'Funerals can’t be planned, but a small family-events jar helps there too. With the minimum funded, the extras become choices. You can still say yes to them. You just aren’t borrowing to.',
    ],
    quiz: [
      {
        prompt: 'Khaled’s cousin’s wedding is in eight months. His gift and outfit will come to about 40,000 DA. What fits?',
        options: [
          no('Borrow when it comes; everyone does.', 'With eight months’ notice, the loan is optional.'),
          ok('Put 5,000 DA a month into a wedding jar.', '40,000 ÷ 8. Calm, ready, no debt.'),
          no('Use the emergency fund.', 'A wedding with a date isn’t an emergency.'),
          no('Skip the wedding.', 'Planning is what lets him go and enjoy it.'),
        ],
      },
      {
        prompt: 'Yasmine lists a gift (minimum), a new dress (extra), a henna-night contribution (minimum) and a hairdresser (extra). Her fund covers the minimums only. What now?',
        options: [
          no('Borrow for the extras so nobody judges.', 'That’s paying a mark-up on a feeling.'),
          ok('Cover the minimums, and add an extra only if the month allows.', 'The extras become real choices.'),
          no('Skip the minimums to afford the extras.', 'That flips her own priorities.'),
          no('Cancel everything.', 'The point is to take part, comfortably.'),
        ],
      },
    ],
    tryIt: 'Create a jar with a target and a date for the next big family event you know is coming.',
    apply: 'jar-with-target',
  }),

  // ───────────────────────── Guard ─────────────────────────
  node({
    id: 'g1-the-four-red-flags',
    branch: 'guard',
    order: 1,
    title: 'Four red flags',
    objective: 'Spot urgency, secrecy, upfront payment and too-good returns in any offer.',
    misconception: 'I’d never fall for a scam.',
    prereqs: [],
    lesson: [
      'Scams change costume every month, but they wear the same four things. Urgency: “today only”, “your account closes in an hour”. Secrecy: “don’t tell your family”. Upfront payment: a deposit, a fee or a code before you get anything. Too good: profits, prices or jobs that beat everything else around.',
      'One flag is a reason to slow down. Two or more is a reason to stop.',
      'Smart people get scammed all the time, because scams are built by professionals to hit busy, hopeful or worried moments. It isn’t about intelligence. It’s about having a checklist ready before the moment comes.',
    ],
    quiz: [
      {
        prompt: 'A Facebook page offers Walid a phone at half the usual price, “today only”, if he sends a 5,000 DA deposit by CCP. How many red flags?',
        options: [
          no('None; deposits are normal.', 'From a stranger’s page, paying before seeing anything is a major flag.'),
          no('One: the price.', 'The price is one. Look at the deadline and the payment too.'),
          ok('Three: too good, urgency, and payment up front.', 'Three flags means stop.'),
          no('None, if the page has lots of followers.', 'Followers can be bought; they prove nothing.'),
        ],
      },
      {
        prompt: 'Lina’s friend says: “I joined a group that doubles money in two weeks. Don’t tell your parents, they won’t get it.” Which flags show?',
        options: [
          ok('Too good and secrecy, with payment up front likely next.', 'Doubling in two weeks plus “don’t tell” is the classic pair.'),
          no('None, because her friend wouldn’t lie.', 'Friends often recruit sincerely, because they were fooled first.'),
          no('Only urgency.', 'There’s no deadline here, but there are other flags.'),
          no('It depends on how professional the group’s logo looks.', 'Logos are the easiest thing to copy.'),
        ],
      },
    ],
    tryIt: 'Run the next too-good offer you see through the four flags before you reply.',
    apply: null,
  }),
  node({
    id: 'g2-your-ccp-is-your-vault',
    branch: 'guard',
    order: 2,
    title: 'Your CCP is your vault',
    objective: 'Never share your card PIN or one-time codes, use only official apps, and check alerts yourself.',
    misconception: 'If someone says they’re calling from the post office, it must be safe.',
    prereqs: ['g1-the-four-red-flags'],
    lesson: [
      'Your CCP number is close to public; it’s on invoices and transfer slips. Your card PIN and BaridiMob one-time codes are not. Nobody from the post office will ever ask for them, by phone, SMS or Messenger.',
      'The common trick: an SMS that looks official says your account is blocked, with a link to a page that looks like BaridiMob. Or a “new BaridiMob” app file shared on Facebook.',
      'The habits: install only from the official app store, never type a code someone asked you for, and check a “blocked” account by opening the real app or visiting a post office. Thirty seconds of doubt costs nothing.',
    ],
    quiz: [
      {
        prompt: 'Amine gets an SMS: “Votre compte CCP est suspendu. Réactivez ici: bit.ly/…”. What’s the safe move?',
        options: [
          no('Tap the link; the page shows the official logo.', 'Logos are easy to copy. The link is the attack.'),
          ok('Open his official app directly to check, and delete the SMS.', 'Going in through his own app avoids the trap.'),
          no('Reply with his CCP number to verify.', 'Replying confirms a live target and hands over details.'),
          no('Call the number in the SMS.', 'That number belongs to whoever sent the trap.'),
        ],
      },
      {
        prompt: 'A friend sends Hamza a “BaridiMob Pro” app file with extra features. What fits?',
        options: [
          no('Install it, since it came from a friend.', 'The friend’s phone or account may already be compromised.'),
          ok('Decline; only the version in the official app store is genuine.', 'Fake app files are a common way to steal codes.'),
          no('Install it on an old phone to test.', 'Any details typed there are still his real ones.'),
          no('Install it but don’t log in.', 'It can still read messages and codes on the phone.'),
        ],
      },
    ],
    tryIt: 'Choose two trusted contacts in the app, the people you’d call first if your account were ever at risk.',
    apply: 'trusted-set',
  }),
  node({
    id: 'g3-marketplace-scams',
    branch: 'guard',
    order: 3,
    title: 'Facebook marketplace',
    objective: 'Pay on delivery or in person when buying from strangers online, never a deposit to an unknown page.',
    misconception: 'A page with many followers is legit.',
    prereqs: ['g1-the-four-red-flags'],
    lesson: [
      'The marketplace pattern is simple. A page posts a great price. You message; they’re friendly and fast. They ask for a deposit by CCP or BaridiMob “to reserve it”. You pay. They block you.',
      'The defence is just as simple. With strangers, pay on delivery, or meet in a public place and check the item before paying. A real seller with a real item can wait for that. A scammer can’t, so they push urgency: “other buyers are waiting.”',
      'Followers, likes and glowing comments are cheap to fake. A seller you can meet, an item you can touch, and payment after you’ve seen it: that’s what counts.',
    ],
    quiz: [
      {
        prompt: 'Hamza finds a used console for 25,000 DA. The seller wants a 5,000 DA CCP deposit before showing it. What’s safest?',
        options: [
          no('Pay; 5,000 DA is a small risk.', 'Small deposits are exactly what this scam collects, many times over.'),
          ok('Offer to meet in a public place and pay once he’s seen it.', 'A real seller agrees; a scammer disappears.'),
          no('Pay if the page has over 10,000 followers.', 'Follower counts are easy to buy.'),
          no('Send a photo of his ID to show he’s serious.', 'That hands a stranger his identity.'),
        ],
      },
      {
        prompt: 'A seller in another city offers delivery with payment on arrival. What’s left for Lina to check?',
        options: [
          ok('Open and check the item before handing over the money.', 'Pay-on-delivery only protects her if she checks first.'),
          no('Nothing; delivery means it’s safe.', 'A box can hold anything.'),
          no('Pay the courier extra to hurry.', 'Speed adds nothing to safety.'),
          no('Ask the seller for his card code to prove he’s real.', 'Codes are never part of buying or selling, in either direction.'),
        ],
      },
    ],
    tryIt: 'For your next online purchase from a stranger, choose payment on delivery or in person.',
    apply: null,
  }),
  node({
    id: 'g4-qr-and-sms',
    branch: 'guard',
    order: 4,
    title: 'QR stickers and SMS links',
    objective: 'Check that a QR code’s merchant name matches the shop, and never tap SMS links to “unblock” an account.',
    misconception: 'A QR code is just a QR code.',
    prereqs: ['g2-your-ccp-is-your-vault'],
    lesson: [
      'QR payments are new and handy. They’re also easy to fake: someone sticks their own QR sticker over the shop’s real one, and your payment goes to them.',
      'The habit takes two seconds. Before you confirm, read the name your app shows. Does it match the shop you’re standing in? If not, stop and ask.',
      'SMS links are the other door. A message says your account is blocked, your parcel is stuck, or you’ve won a prize, with a link. Don’t tap. Open your official app yourself, or ask at a post office. If something really is wrong, you’ll see it there.',
    ],
    quiz: [
      {
        prompt: 'Lina scans the QR code at a café. Her app shows the name “Ahmed B.” instead of the café’s name. What now?',
        options: [
          no('Pay; it’s probably the owner.', 'Maybe, but a pasted-over sticker looks exactly like this.'),
          ok('Stop, and ask the staff before paying.', 'Two seconds of asking beats a payment to a stranger.'),
          no('Pay half to test it.', 'Half is still lost if the sticker is fake.'),
          no('Scan it again until the name changes.', 'The same code gives the same name every time.'),
        ],
      },
      {
        prompt: 'An SMS tells Walid: “Your parcel is held. Pay 150 DA customs here: [link].” He isn’t expecting a parcel. What fits?',
        options: [
          no('Pay; it’s only 150 DA.', 'The small fee is the bait; the card details are the prize.'),
          ok('Delete it, and check his real account in the official app.', 'Going in through his own app avoids the trap.'),
          no('Reply STOP.', 'Replying confirms his number is active.'),
          no('Forward it to friends to ask what they think.', 'That spreads the link further.'),
        ],
      },
    ],
    tryIt: 'After any message about your account, open the official app yourself and confirm your balance there.',
    apply: 'confirm-balance',
  }),
  node({
    id: 'g5-job-visa-investment',
    branch: 'guard',
    order: 5,
    title: 'Jobs, visas, “investments”',
    objective: 'Recognise fake jobs, visa offers and “investment” groups as the same upfront-fee pattern.',
    misconception: 'They showed me screenshots of profits, so it must be real.',
    prereqs: ['g1-the-four-red-flags', 'j1-save-vs-invest'],
    lesson: [
      'Three stories, one pattern. A job abroad: “just pay 30,000 DA for the file”. A visa helper: “80,000 DA and it’s done in two weeks”. A Telegram investment group: “put in 20,000 DA, earn 10% a week”, with screenshots of happy members.',
      'Each asks for money up front, promises far more than normal, and pushes you to act fast. Pyramid schemes even pay early members with newer members’ money, so the screenshots can be real, for a while.',
      'Real employers don’t charge you to hire you. Real visas go through official channels with published fees. Real investments don’t promise fixed weekly profits.',
    ],
    quiz: [
      {
        prompt: 'Khaled is offered a hotel job in Europe if he pays 40,000 DA for “processing”. What does the pattern say?',
        options: [
          no('That’s normal; jobs abroad cost money.', 'Genuine employers don’t charge candidates to hire them.'),
          ok('An upfront fee plus a too-good promise: stop and verify through official channels.', 'Two flags, in the classic job-scam shape.'),
          no('Pay half to be safe.', 'Half is still lost.'),
          no('Pay once they send a contract.', 'Fake contracts are easy to make.'),
        ],
      },
      {
        prompt: 'Nadia’s cousin has been paid real profits for two months by a group promising 10% a week. Is it safe?',
        options: [
          no('Yes, the profits are real.', 'Pyramids pay early members with newer members’ money, until they stop.'),
          ok('No; 10% a week isn’t how real investments work, early payouts or not.', 'Early payouts are how these schemes recruit.'),
          no('Yes, as long as she only puts in a little.', 'A little is still lost, and she may be asked to recruit others.'),
          no('Only if her cousin vouches for it.', 'Her cousin may be a victim who hasn’t found out yet.'),
        ],
      },
    ],
    tryIt: 'Take one real offer you’ve seen, a job, visa or investment, and check it against the four flags.',
    apply: null,
  }),
  node({
    id: 'g6-after-a-scam',
    branch: 'guard',
    order: 6,
    title: 'If it already happened',
    objective: 'Know the first 24 hours after a scam: block, report, warn, and ignore “recovery” offers.',
    misconception: 'It’s gone, so there’s nothing to do.',
    prereqs: ['g2-your-ccp-is-your-vault'],
    lesson: [
      'If it already happened, speed matters more than embarrassment. Plenty of careful people get caught.',
      'In the first hours: block your card and change your app password, through the official app or at a post office. Report it there and to the police, who have units for online crime. Keep screenshots, numbers and receipts. Warn your contacts if your account or phone was used.',
      'A second wave often follows: someone offering to get your money back, for a fee. That’s a second scam aimed at people who were just scammed. Real reporting is free. Talk to someone you trust; you don’t have to handle this alone.',
    ],
    quiz: [
      {
        prompt: 'Salma realises she typed her code into a fake page an hour ago. What comes first?',
        options: [
          no('Wait to see whether money disappears.', 'Every hour gives the scammer more time.'),
          ok('Block the card and change her password through official channels, right now.', 'Stopping further loss comes first.'),
          no('Message the scammer to ask for it back.', 'That keeps her talking to the person who robbed her.'),
          no('Delete the app and try to forget it.', 'Deleting the app doesn’t block the account.'),
        ],
      },
      {
        prompt: 'A week later, someone messages Salma: “We recover scam money. Fee: 10,000 DA.” What is this most likely to be?',
        options: [
          no('A lucky break.', 'Recovery offers that charge up front are a known follow-up scam.'),
          ok('A second scam; real reporting is free.', 'It targets people right after a loss.'),
          no('Worth trying with half the fee.', 'Half is still lost.'),
          no('The police contacting her.', 'Official bodies don’t charge fees to help.'),
        ],
      },
    ],
    tryIt: 'Save the people you’d call first after a scam as your trusted contacts in the app.',
    apply: 'trusted-set',
  }),

  // ───────────────────────── Grow ─────────────────────────
  node({
    id: 'j1-save-vs-invest',
    branch: 'grow',
    order: 1,
    title: 'Saving vs investing',
    objective: 'Separate money you’ll need soon, kept safe, from money that can work for years and ride ups and downs.',
    misconception: 'Investing is either gambling or a way to get rich fast.',
    prereqs: ['b7-three-months', 'd3-cash-loses-value'],
    lesson: [
      'Saving and investing do different jobs. Saving keeps money safe and reachable for things you’ll need: the cushion, next year’s goals. Investing puts money into something that can grow, like a business share, sukuk, gold or property, and accepts that its value can dip along the way.',
      'The line between them is time. Money you need within a couple of years belongs in the safe bucket. Money you won’t need for five years or more can go in the growth bucket.',
      'Investing isn’t gambling: you own something real. It isn’t a get-rich scheme either: growth is usually slow. And it comes after the cushion, not instead of it.',
    ],
    quiz: [
      {
        prompt: 'Amine has a 90,000 DA cushion and 50,000 DA he won’t need for five years. Which split fits?',
        options: [
          no('Invest all 140,000 DA to grow faster.', 'The cushion has to be reachable at any moment.'),
          ok('Keep the cushion safe, and consider investing the 50,000 DA.', 'Each bucket does its own job.'),
          no('Keep it all in cash forever.', 'Long-term money is the part most worn down by rising prices.'),
          no('Put it all into a friend’s new project.', 'That’s everything in one place, cushion included.'),
        ],
      },
      {
        prompt: 'Lina’s uncle says investing is just gambling. What’s a fair answer?',
        options: [
          no('He’s right; it’s all luck.', 'Owning a real asset is different from betting on an outcome.'),
          ok('Gambling bets on chance; investing owns something real that can rise or fall.', 'There’s risk, but the structure is different.'),
          no('Investing can’t lose.', 'It can, which is why only long-term money goes there.'),
          no('Only rich people invest.', 'Some options start from modest amounts.'),
        ],
      },
    ],
    tryIt: 'Note which of your savings you’ll need within two years, and which could wait five years or more.',
    apply: null,
  }),
  node({
    id: 'j2-risk-and-time',
    branch: 'grow',
    order: 2,
    title: 'Risk and time',
    objective: 'Explain why risk only makes sense for money you won’t need for years.',
    misconception: 'High returns with low risk exist if you know the right person.',
    prereqs: ['j1-save-vs-invest'],
    lesson: [
      'Higher possible returns come with bigger swings. That’s the deal, everywhere. Anyone offering high returns with no risk is either mistaken or lying.',
      'Time is what makes swings bearable. If gold drops 15% this year and you need the money next month, you sell at a loss. If you don’t need it for eight years, you can wait for a recovery. Short-term money and risky assets are a bad match. Long-term money and some risk can work.',
      'So for each goal, ask one question first: when do I need this? The answer decides how much risk that money can carry.',
    ],
    quiz: [
      {
        prompt: 'Hamza needs 200,000 DA for his wedding in eight months. A friend suggests a risky but promising asset. What fits?',
        options: [
          no('Go for it; eight months is plenty.', 'A drop near the date would leave him short at the worst moment.'),
          ok('Keep it safe; eight months is too short to ride out a drop.', 'Short goals need steady, reachable money.'),
          no('Split it 50/50.', 'Half could still fall right before the wedding.'),
          no('Borrow more to invest alongside it.', 'Debt adds risk on top of risk.'),
        ],
      },
      {
        prompt: 'Someone promises Yasmine 5% a month “with zero risk, I know people”. What’s the reality?',
        options: [
          no('Possible with the right connections.', 'Real high returns always carry real risk.'),
          ok('High return with no risk isn’t a real offer.', 'That’s the shape of most scams.'),
          no('Fine if it’s a small amount.', 'Small amounts get lost too, and she may be asked to recruit.'),
          no('Only a problem if it isn’t halal.', 'It fails the risk test before any other question.'),
        ],
      },
    ],
    tryIt: 'For each savings goal, write down when you’ll need the money, and let that decide how much risk it can take.',
    apply: null,
  }),
  node({
    id: 'j3-what-exists-locally',
    branch: 'grow',
    order: 3,
    title: 'What exists in Algeria',
    objective: 'Know the main saving and investing options available in Algeria and their tradeoffs.',
    misconception: 'There’s nothing to invest in here.',
    prereqs: ['j1-save-vs-invest'],
    lesson: [
      'The list is longer than most people think. Savings at the post office or a bank, including Islamic-window savings based on profit-sharing. Sovereign sukuk, which have been offered to individual savers. Shares on the Algiers stock exchange, a small but real market. Gold. Property. A share in a real small business. Even livestock, a traditional store of value.',
      'Each has tradeoffs: a minimum amount, how quickly you can sell, the cost of buying and selling, and its own risks. Some need a bank account; others don’t.',
      'You don’t need all of them. You just need to know they exist, so “there’s nothing here” stops being the reason not to start.',
    ],
    quiz: [
      {
        prompt: 'Walid says there’s nothing to invest in locally except euros. What’s accurate?',
        options: [
          no('He’s right.', 'Several local options exist, each with tradeoffs.'),
          ok('There are options, like Islamic-window savings, sukuk, shares, gold, property or a small business.', 'The list is longer than it looks.'),
          no('Only foreign platforms work.', 'Local options exist, and foreign ones bring their own rules and risks.'),
          no('Only property counts.', 'Property is one option, and a big one to start with.'),
        ],
      },
      {
        prompt: 'Nadia has 30,000 DA to start with and no bank account. Which is a realistic first step?',
        options: [
          no('Buy a flat.', 'Far beyond 30,000 DA.'),
          ok('Look at post-office savings options, or a small amount of gold, while she learns.', 'Low entry, and some need no bank at all.'),
          no('Join a Telegram trading group.', 'That’s the scam pattern from the Guard branch.'),
          no('Wait until she has a million.', 'Learning can start with small amounts.'),
        ],
      },
    ],
    tryIt: 'Pick two local options you’d like to understand better, and look up their minimum amount and how easy they are to sell.',
    apply: null,
  }),
  node({
    id: 'j4-halal-lens',
    branch: 'grow',
    order: 4,
    title: 'The halal lens',
    objective: 'Apply three questions to any product: riba, excessive uncertainty (gharar), and forbidden activity.',
    misconception: 'Only products with “Islamic” in the name can be halal.',
    prereqs: ['c3-riba-vs-markup', 'j3-what-exists-locally'],
    lesson: [
      'You don’t need to be a scholar to ask three questions of any product. One: does my return come from lending money and getting more money back? That’s riba. Two: is it so uncertain it’s closer to a bet than a trade, like an unknown asset or a promise of 20% a month? That’s gharar. Three: does the business behind it do something forbidden, like alcohol or gambling?',
      'Sukuk, a share in a real business, gold, livestock and rental property can pass. A Telegram “forex signals” group fails question two before you reach question one.',
      'Scholars differ on edge cases; for those, ask a scholar you trust. The three questions catch the clear ones, and most scams too.',
    ],
    quiz: [
      {
        prompt: 'Salma is weighing four options. Which fails the uncertainty (gharar) question most clearly?',
        options: [
          no('Sovereign sukuk with a disclosed asset and return.', 'Clear structure, clear asset: it’s designed to pass.'),
          ok('A Telegram group promising 15% a month from “AI trading”.', 'Unknown asset and an impossible promise.'),
          no('Buying 10 g of gold at a published price from a reputable seller.', 'Clear asset, clear price.'),
          no('A share in a friend’s café with a written profit split.', 'Known business, known terms.'),
        ],
      },
      {
        prompt: 'Nadia wants her emergency fund to be both halal and safe. Which fits best?',
        options: [
          ok('Cash, plus an Islamic-window savings account for the part above the cushion.', 'Reachable, and in line with her values.'),
          no('A conventional account, because it’s safer.', 'Safety and her values don’t have to conflict here; options exist for both.'),
          no('Gold jewellery.', 'Slow to sell and costly to resell, which is hard on emergency money.'),
          no('Lend it to a cousin’s shop for 5% a month.', 'Fixed interest on a loan is riba on mainstream views, and it’s all in one place.'),
        ],
      },
    ],
    tryIt: 'Apply the three questions to one product you’ve been offered, and note where it passes or fails.',
    apply: null,
  }),
  node({
    id: 'j5-gold-property-business',
    branch: 'grow',
    order: 5,
    title: 'Gold, property, a business',
    objective: 'Compare how easy to sell, how costly to trade, and how risky gold, property and a small business are.',
    misconception: 'Gold always goes up, and property can’t lose.',
    prereqs: ['j3-what-exists-locally', 'd2-two-rates'],
    lesson: [
      'Gold, property and a small business are the classic Algerian “investments”. Each comes with a story people repeat, and each has a catch.',
      'Gold is easy to buy in small amounts and tends to hold value over long periods. But jewellery carries making costs you don’t get back, and prices can fall for years.',
      'Property feels solid, but it needs a large sum, takes months to sell, and costs money in paperwork, repairs and empty months. A business can earn the most, and fail the fastest.',
      'None is bad. Each suits different money, time and temperament. Ask: how fast can I sell, what does trading cost, and what could go wrong?',
    ],
    quiz: [
      {
        prompt: 'Salma wants to put her three-month cushion into gold jewellery “because gold always goes up”. What’s the catch?',
        options: [
          no('None; gold never falls.', 'Gold can fall, sometimes for years.'),
          ok('Jewellery loses its making cost on resale, and a cushion has to be quick to reach.', 'Two mismatches for emergency money.'),
          no('Owning gold is forbidden.', 'Gold is widely seen as permissible to hold as savings.'),
          no('Gold can’t be sold in Algeria.', 'It can, but jewellery often sells below what you paid.'),
        ],
      },
      {
        prompt: 'Khaled has 500,000 DA. His cousin wants all of it for a new phone shop, “zero risk”. What does the comparison suggest?',
        options: [
          no('All in; it’s family.', 'Family doesn’t remove business risk.'),
          ok('Put in only what he could afford to lose, with written terms, and keep the rest elsewhere.', 'Spreading limits the damage if the shop struggles.'),
          no('Never invest with family.', 'It can work, with clear terms and an amount he can afford to lose.'),
          no('Buy property instead, since it can’t lose.', 'Property has its own risks and needs far more money.'),
        ],
      },
    ],
    tryIt: 'For gold, property and a small business, note how fast you could sell and what buying and selling would cost.',
    apply: null,
  }),
  node({
    id: 'j6-first-100000',
    branch: 'grow',
    order: 6,
    title: 'Your first 100,000 DA',
    objective: 'Build a growth goal with a simple rule, like a share of every income, and a place you’ve checked.',
    misconception: 'I’ll invest when I have real money.',
    prereqs: ['j2-risk-and-time', 'j4-halal-lens'],
    lesson: [
      'People wait for “real money” before growing it. But real money is mostly built, not found.',
      'A growth goal needs a rule and a place. The rule might be 5% of every income, or 3,000 DA each payday. The place is one option you’ve checked: a profit-sharing savings account, a little gold each quarter, a step toward sukuk.',
      'At 3,000 DA a month, 100,000 DA takes under three years. Not fast. But by then you’ll have a habit, some experience and a real sum. It works best once the cushion is in place and costly debts are cleared; growth money is the last layer, not the first.',
    ],
    quiz: [
      {
        prompt: 'Lina earns 40,000–60,000 DA a month and her cushion is full. Which growth rule is easiest to keep?',
        options: [
          ok('5% of every income, moved the day it arrives.', 'It scales with good and lean months and runs on habit.'),
          no('20,000 DA a month, no matter what.', 'Too big for her lean months, so she’d likely stop.'),
          no('Whatever’s left at the end of the year.', 'Leftovers rarely survive a year.'),
          no('Wait for a big bonus.', 'Waiting is how years pass with no start.'),
        ],
      },
      {
        prompt: 'Amine’s cushion is full, but he still owes 30,000 DA on a shop plan with late fees. Where does growth money fit?',
        options: [
          no('First, because investing beats everything.', 'A sure cost on the debt usually outweighs an unsure gain.'),
          ok('After the costly debt is cleared.', 'Growth money is the last layer.'),
          no('Funded from the cushion.', 'That would leave him unprotected.'),
          no('Alongside the debt, with borrowed money.', 'Borrowing to invest stacks risk on risk.'),
        ],
      },
    ],
    tryIt: 'Create a growth jar with a 100,000 DA target and a monthly amount from your rule.',
    apply: 'jar-with-target',
  }),
  node({
    id: 'j7-diversify-and-ignore',
    branch: 'grow',
    order: 7,
    title: 'Spread it, then ignore it',
    objective: 'Avoid putting everything in one place, and avoid checking prices every day.',
    misconception: 'Watching it closely makes it safer.',
    prereqs: ['j5-gold-property-business', 'j6-first-100000'],
    lesson: [
      'Two habits protect growth money. The first is spreading it. Everything in one cousin’s shop, or one kind of asset, means one bad year can wipe you out. Two or three different places means a bad year is a bad year, not a disaster.',
      'The second sounds strange: look less. People who check prices every day tend to sell in a panic after drops and buy after big rises, which is backwards. Watching doesn’t change the price; it only changes your nerves.',
      'A monthly look is enough for long-term money. Review the spread once a year. Then get on with your life.',
    ],
    quiz: [
      {
        prompt: 'Hamza has 300,000 DA of growth money, all in gold. What does spreading suggest?',
        options: [
          no('It’s fine; gold is safe.', 'Gold can fall too, and one asset means one risk.'),
          ok('Move part of it into a second option, like a profit-sharing account or sukuk.', 'Two places means a drop in one isn’t a disaster.'),
          no('Move all of it into something else.', 'That’s still one basket, just a different one.'),
          no('Lend it all to a friend’s business.', 'That’s concentration plus friendship risk.'),
        ],
      },
      {
        prompt: 'Nadia checks the value of her gold five times a day and feels anxious with every dip. What helps?',
        options: [
          no('Check even more often to catch the bottom.', 'Nobody reliably catches the bottom.'),
          ok('Check once a month, and only change things at a yearly review.', 'Less watching, fewer panic moves.'),
          no('Sell everything after a dip to feel safe.', 'Selling after a drop locks in the loss.'),
          no('Borrow to buy more on every dip.', 'That adds debt to nerves.'),
        ],
      },
    ],
    tryIt: 'Pick one day a month to check your growth money, and put it in your calendar.',
    apply: null,
  }),
]

/** Canonical id set — persisted progress is validated against it. */
export const NODE_IDS: ReadonlySet<string> = new Set(NODES.map((n) => n.id))

const BY_ID: ReadonlyMap<string, SkillNode> = new Map(NODES.map((n) => [n.id, n]))

export function nodeById(id: string): SkillNode | undefined {
  return BY_ID.get(id)
}

/** A branch's nodes, sorted by their position in the branch. */
export function nodesInBranch(id: BranchId): SkillNode[] {
  return NODES.filter((n) => n.branch === id).sort((a, b) => a.order - b.order)
}
