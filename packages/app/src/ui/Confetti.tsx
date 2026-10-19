/**
 * Confetti.tsx — CSS-only burst for the human winning (design §2.4).
 */
import { confettiPieces } from './confetti';

export function Confetti() {
    return (
        <div className="confetti" aria-hidden="true">
            {confettiPieces().map((piece) => (
                <span
                    key={piece.id}
                    className={`confetti-piece ${piece.color}`}
                    style={{
                        left: `${piece.leftPercent}%`,
                        animationDelay: `${piece.delayMs}ms`,
                        animationDuration: `${piece.durationMs}ms`,
                    }}
                />
            ))}
        </div>
    );
}
