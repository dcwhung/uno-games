/**
 * RoundTable.tsx — the per-seat breakdown inside the round-over sheet.
 */
import { t } from '../i18n';
import type { RoundRow } from './roundSummary';

export function RoundTable({ rows }: { readonly rows: readonly RoundRow[] }) {
    return (
        <table className="round-table">
            <thead>
                <tr>
                    <th scope="col" className="left">
                        {t('hud.col.player')}
                    </th>
                    <th scope="col">{t('hud.col.cards')}</th>
                    <th scope="col">{t('hud.col.round')}</th>
                    <th scope="col">{t('hud.col.total')}</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((row) => (
                    <tr key={row.id} className={row.winner ? 'winner' : undefined}>
                        <th scope="row" className="left">
                            <span
                                className="seat-dot"
                                style={{ background: row.color }}
                                aria-hidden="true"
                            />
                            {row.name}
                        </th>
                        <td>{row.cardsLeft}</td>
                        <td>{row.roundPoints > 0 ? `+${row.roundPoints}` : row.roundPoints}</td>
                        <td className="total">{row.total}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
