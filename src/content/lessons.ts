/**
 * Daily lesson content + rotation. Pure content and pure functions only — no
 * imports from state or engines, so the store can import the roster without a
 * cycle. Voice rules for every lesson: playful-but-honest, money examples in
 * DA, tradeoffs never verdicts, and no medical or therapeutic claims (impulse
 * lessons speak in everyday behavioral terms only).
 *
 * The design system's §7 fragment rule applies to titles and one-liners, NOT
 * to bodies: a lesson has to teach, and teaching needs sentences. What §7
 * does bind everywhere here is the word list (§7.5) and the exclamation ban
 * (§7.4) — both are guarded in lessons.test.ts so a new lesson cannot quietly
 * reintroduce them.
 */

export interface Lesson {
  /** Stable slug — persisted in AppState.lessonsSeen, so ids must never change. */
  id: string
  title: string
  /** Codex card caption — one short line, no numbers required. */
  oneLiner: string
  /** The lesson itself: 2–3 sentences, one screen. */
  body: string
}

export const LESSONS: ReadonlyArray<Lesson> = [
  // — Budgeting —
  {
    id: 'budget-sketch',
    title: 'The 50/30/20 sketch',
    oneLiner: 'A budget is a sketch, not a cage.',
    body: 'One rough split: about half your income for needs, a third for wants, the rest saved. On 60,000 DA a month that is roughly 30,000 needs, 18,000 wants, 12,000 saved. It is a sketch, not a cage — redraw it until it fits your life.',
  },
  {
    id: 'track-first',
    title: 'Track before you plan',
    oneLiner: 'You cannot steer a number you have never seen.',
    body: 'Most budgets fail because they are built on guesses. Log real purchases for two weeks first — memory routinely misses a big slice of small spending. The plan comes after the evidence.',
  },
  {
    id: 'invisible-category',
    title: 'The invisible category',
    oneLiner: 'Small repeat buys add up to a real bill.',
    body: 'A 150 DA coffee every workday is about 3,300 DA a month — the size of a real bill. Small repeat purchases hide because each one feels harmless. Naming the category is how you get to decide on it, either way.',
  },
  {
    id: 'zero-based',
    title: 'Every dinar gets a job',
    oneLiner: 'Unassigned money assigns itself.',
    body: 'Zero-based budgeting: income minus every planned category lands on zero before the month starts. Not because spending is bad — because money without a job quietly finds one you did not pick.',
  },
  {
    id: 'budget-drift',
    title: 'Budgets drift',
    oneLiner: 'A plan from January rarely fits August.',
    body: 'Prices move, habits move, life moves — a budget written once slowly stops describing anything. A ten-minute monthly check-in beats a perfect plan you never reopen.',
  },
  // — Saving —
  {
    id: 'pay-yourself-first',
    title: 'Pay yourself first',
    oneLiner: 'Whatever is left over is the first thing to vanish.',
    body: 'Saving what remains at month-end usually means saving nothing. Move a fixed amount the day money arrives — even 1,000 DA. The order matters more than the amount.',
  },
  {
    id: 'savings-bill',
    title: 'Make saving a bill',
    oneLiner: 'Rent for Future You, due monthly.',
    body: 'Bills get paid because they have a fixed amount and a date. Give your savings the same deal: same amount, same day, addressed to Future You. Optional things lose to urgent things every single month.',
  },
  {
    id: 'start-small',
    title: 'Start embarrassingly small',
    oneLiner: 'The first goal is the habit, not the balance.',
    body: '500 DA a week feels pointless — until it is 26,000 DA a year, and more importantly a habit with momentum. The first job of saving is proving to yourself you are a person who saves.',
  },
  {
    id: 'name-the-goal',
    title: 'Name the goal',
    oneLiner: 'Vague money answers to whoever asks first.',
    body: 'A goal with a name and a number — "laptop, 180,000 DA" — is far easier to protect than a vague pile called savings. Money saved "for later" leaks; money saved "for the laptop" argues back.',
  },
  {
    id: 'separate-places',
    title: 'Separate places, separate purposes',
    oneLiner: 'Goal money should not sit next to lunch money.',
    body: 'Savings kept beside spending money tends to get spent. A different account, envelope, or drawer turns touching the goal into a decision instead of an accident. Distance is a feature.',
  },
  // — Compound interest —
  {
    id: 'interest-on-interest',
    title: 'Interest earns interest',
    oneLiner: 'Returns start earning their own returns.',
    body: '100,000 DA growing 5% a year is 105,000 after one year — but about 163,000 after ten, not 150,000. The extra 13,000 is interest earned by earlier interest. That gap is the whole trick.',
  },
  {
    id: 'time-beats-amount',
    title: 'Time beats amount',
    oneLiner: 'An early start outworks a bigger deposit.',
    body: 'With compounding, 2,000 DA a month started now can end up ahead of 4,000 DA a month started years later. The early dinars simply get more compounding rounds. Waiting for a bigger salary has a price tag.',
  },
  {
    id: 'rule-of-72',
    title: 'The rule of 72',
    oneLiner: 'A napkin trick for doubling time.',
    body: 'Divide 72 by a yearly growth rate to estimate how long money takes to double: at 6% a year, about 12 years. It is a napkin estimate, not a promise — but it turns "percent per year" into something you can feel.',
  },
  {
    id: 'compound-both-ways',
    title: 'Compounding has no loyalty',
    oneLiner: 'The same math grows unpaid debt.',
    body: 'Interest on interest does not care which side of the ledger you are on. A 20,000 DA debt left alone at 20% a year is 24,000 next year, then almost 29,000. Small debts rarely stay small by themselves.',
  },
  // — Inflation —
  {
    id: 'price-creep',
    title: 'Prices creep, quietly',
    oneLiner: 'Cash under the mattress shrinks while it sits.',
    body: 'If prices rise 7% in a year, 10,000 DA hidden at home still says 10,000 — but buys about what 9,300 bought last year. Nothing was stolen; the prices just moved. That quiet shrink is inflation.',
  },
  {
    id: 'moving-target',
    title: 'Goals are moving targets',
    oneLiner: 'Price the goal for the year you arrive.',
    body: 'A 300,000 DA goal saved over three years of rising prices will likely cost more than 300,000 when you get there. Add a margin for the road, or plan to update the number as prices move.',
  },
  {
    id: 'real-vs-nominal',
    title: 'Real vs. nominal',
    oneLiner: 'Ask what the money buys, not what it says.',
    body: 'A 5% raise in a year of 8% inflation buys less than last year did — the number went up while the groceries went further up. The printed amount is "nominal"; what it buys is "real". Always ask about the real one.',
  },
  // — Debt —
  {
    id: 'minimum-trap',
    title: 'Minimums buy time, not freedom',
    oneLiner: 'The minimum keeps the loan alive.',
    body: 'Minimum payments are sized to keep a debt going, not to finish it. Anything above the minimum goes straight at the principal — even a few hundred DA extra can cut months off the end.',
  },
  {
    id: 'rate-order',
    title: 'Sort debts by rate',
    oneLiner: 'The highest rate is the hungriest mouth.',
    body: 'Extra payments do the most work against the highest interest rate — paying that first is the "avalanche". Paying smallest-first (the "snowball") costs a bit more overall but pays out in motivation. Both beat paying at random.',
  },
  {
    id: 'renting-money',
    title: 'Debt is renting money',
    oneLiner: 'Interest is the rent — ask what it buys.',
    body: 'Interest is rent paid to use someone else\'s money. Renting 100,000 DA for a tool that earns income is one deal; renting it for a phone outdated before the loan ends is another. Same rent, different tenants.',
  },
  {
    id: 'future-you-loan',
    title: 'Borrowing from Future You',
    oneLiner: 'Future You co-signs every loan, silently.',
    body: 'Every loan is Future You covering for Present You. That can be a fair trade — Future You may earn more — but they never get a vote. Drive the bargain like someone you like is on the other side.',
  },
  // — Emergency funds —
  {
    id: 'three-month-cushion',
    title: 'The three-month cushion',
    oneLiner: 'Big target, small first step.',
    body: 'A classic target: about three months of essentials within reach. If essentials run 35,000 DA a month, that is 105,000 DA — a big number that still starts at the first 5,000. The cushion is built, never bought.',
  },
  {
    id: 'when-not-if',
    title: 'Surprises are when, not if',
    oneLiner: 'A cushion turns a crisis into an inconvenience.',
    body: 'Phones break, jobs wobble, prices jump — the fund does not prevent any of it. What it does is change the category: from crisis to inconvenience. That downgrade is the entire product.',
  },
  {
    id: 'boring-cushion',
    title: 'Keep the cushion boring',
    oneLiner: 'Its return is measured in panic avoided.',
    body: 'An emergency fund\'s job is being there, not growing fast. Keep it reachable and dull — no lock-ups, no bets. Its yield is measured in panic avoided, not percent earned.',
  },
  {
    id: 'cheapest-insurance',
    title: 'The fund is cheap insurance',
    oneLiner: 'Cheaper than the loan the surprise demands.',
    // "premium" was the insurance sense, not the marketing one — but §7.5's
    // ban is worded absolutely, and "a rate you set yourself" says the same
    // thing in the register the rest of the roster already uses.
    body: 'Without a cushion, surprises get funded by borrowing at whatever rate the emergency accepts — usually the worst one on offer. The fund is insurance you pay yourself, at a rate you set yourself.',
  },
  // — Impulse psychology —
  {
    id: 'overnight-test',
    title: 'The overnight test',
    oneLiner: 'If the want survives the night, it earns a plan.',
    body: 'Wanting something and wanting to have bought it are different feelings. Park the item for a day; if the want is still there tomorrow, it earns a spot in the plan. Many wants do not survive the night.',
  },
  {
    id: 'price-in-hours',
    title: 'Price it in hours',
    oneLiner: 'Every price has an exchange rate into your time.',
    body: 'Divide a price by what you earn per hour. A 6,000 DA gadget at 500 DA an hour costs 12 working hours. Sometimes that trade is worth it — the point is knowing the exchange rate before you pay it.',
  },
  {
    id: 'stores-are-designed',
    title: 'Stores are designed',
    oneLiner: 'A list is armor in an engineered arena.',
    body: 'End-of-aisle displays, "only 2 left", sweets at the register — shop layouts are engineered by professionals to shrink the gap between seeing and buying. You are not weak; you are outnumbered. A written list is armor.',
  },
  {
    id: 'discount-math',
    title: 'A discount on nothing',
    oneLiner: '"50% off" only saves money you were going to spend.',
    body: 'A 4,000 DA jacket at half price saves 2,000 DA — if you were already going to buy it. If you were not, the same tag reads: spend 2,000 DA. The discount did not change; your plan is what decides which line is true.',
  },
  {
    id: 'mood-spending',
    title: 'Moods go shopping',
    oneLiner: 'Know which mood reaches for your wallet.',
    body: 'Tired, bored, celebrating — spending is a quick lever to feel different, and the feeling fades fast while the charge stays. Noticing which mood sends you shopping costs nothing and tends to be cheaper than the shopping.',
  },
]

/** Canonical id set — the sanitizer and reducer validate persisted ids against it. */
export const LESSON_IDS: ReadonlySet<string> = new Set(LESSONS.map((l) => l.id))

/**
 * Deterministic small hash (FNV-1a) of a day key — no Math.random anywhere in
 * the rotation, so every render, tab, and reload of the same day agrees.
 */
function hashDay(day: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Today's lesson: deterministic by date, no repeats until every lesson has
 * been seen, then the full roster rotates again (still date-deterministic).
 * Entries seen TODAY stay in the candidate pool on purpose — pressing "Got
 * it" stamps today's date, and removing the lesson mid-day would swap the
 * card's content under the user right after they read it. Only days strictly
 * before today shrink the pool.
 */
export function lessonForDay(
  today: string,
  seen: ReadonlyArray<{ id: string; date: string }>,
): Lesson {
  const seenBefore = new Set(seen.filter((e) => e.date < today).map((e) => e.id))
  const pool = LESSONS.filter((l) => !seenBefore.has(l.id))
  const candidates = pool.length > 0 ? pool : LESSONS
  return candidates[hashDay(today) % candidates.length]
}
