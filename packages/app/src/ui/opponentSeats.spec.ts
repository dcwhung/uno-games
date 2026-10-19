import { describe, expect, it } from 'vitest';

import { seatLabel } from './opponentSeats';

const ONE = 1;
const THREE = 3;
// scripts/smoke.mjs clicks `getByRole('button', { name: 'Play', exact: true })`;
// a seat label that starts with "Play" would make that locator ambiguous again.
const PLAY_PREFIX = /^play/i;

describe('seatLabel', () => {
    it('should read "1 opponent" for a single seat', () => {
        expect(seatLabel(ONE)).toBe('1 opponent');
    });

    it('should pluralise for more than one seat', () => {
        expect(seatLabel(THREE)).toBe('3 opponents');
    });

    it('should never start with "Play" so the lobby Play button stays unique', () => {
        expect(seatLabel(ONE)).not.toMatch(PLAY_PREFIX);
        expect(seatLabel(THREE)).not.toMatch(PLAY_PREFIX);
    });
});
