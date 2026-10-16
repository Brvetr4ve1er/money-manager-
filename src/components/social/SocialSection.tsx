import type { RouteProps } from '../../routes/types.ts'
import { TontinesCard } from './TontinesCard.tsx'
import { IousCard } from './IousCard.tsx'
import { ZakatCard } from './ZakatCard.tsx'
import './social.css'

/** Social & local money on the Me room: tontines, IOUs, the zakat helper. */
export function SocialSection({ state, dispatch, today }: RouteProps) {
  return (
    <>
      <TontinesCard social={state.social} today={today} dispatch={dispatch} />
      <ZakatCard zakat={state.social.zakat} dispatch={dispatch} />
      <IousCard social={state.social} today={today} dispatch={dispatch} />
    </>
  )
}
