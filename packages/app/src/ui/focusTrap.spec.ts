/**
 * focusTrap.spec.ts — the pure half of the sheet's focus containment (W-086):
 * which nodes sit outside an open sheet, and how they are made inert and
 * restored. Driven with plain objects; no DOM.
 */
import { describe, expect, it } from 'vitest';

import { makeInert, nodesOutside } from './focusTrap';
import type { Inertable, TreeNode } from './focusTrap';

interface FakeNode extends TreeNode, Inertable {
    readonly name: string;
    parentElement: FakeNode | null;
    readonly children: FakeNode[];
    inert: boolean;
}

function node(name: string, children: FakeNode[] = []): FakeNode {
    const made: FakeNode = { name, parentElement: null, children, inert: false };
    for (const child of children) child.parentElement = made;
    return made;
}

const names = (nodes: readonly TreeNode[]) => nodes.map((n) => (n as FakeNode).name);

/** body > app > [canvas, hud > [hud-top > [menu, strip, backdrop], banner, column]] */
function table() {
    const backdrop = node('backdrop');
    const hudTop = node('hud-top', [node('menu'), node('strip'), backdrop]);
    const hud = node('hud', [hudTop, node('banner'), node('column')]);
    const app = node('app', [node('canvas'), hud]);
    const body = node('body', [app]);
    return { body, app, hud, hudTop, backdrop };
}

describe('nodesOutside', () => {
    it('should list every sibling of the leaf and of each ancestor below the root', () => {
        const { body, backdrop } = table();

        expect(names(nodesOutside(backdrop, body))).toEqual([
            'menu',
            'strip',
            'banner',
            'column',
            'canvas',
        ]);
    });

    it('should never include the leaf, its ancestors or the root', () => {
        const { body, app, hud, hudTop, backdrop } = table();

        const outside = nodesOutside(backdrop, body);

        for (const kept of [backdrop, hudTop, hud, app, body]) expect(outside).not.toContain(kept);
    });

    it('should return nothing when the leaf is the root', () => {
        const { body } = table();

        expect(nodesOutside(body, body)).toEqual([]);
    });

    it('should stop at the top of the tree when the root is not an ancestor', () => {
        const { backdrop } = table();
        const stranger = node('stranger');

        expect(names(nodesOutside(backdrop, stranger))).toEqual([
            'menu',
            'strip',
            'banner',
            'column',
            'canvas',
        ]);
    });
});

describe('makeInert', () => {
    it('should mark every node inert', () => {
        const nodes = [node('a'), node('b')];

        makeInert(nodes);

        expect(nodes.map((n) => n.inert)).toEqual([true, true]);
    });

    it('should restore each node to what it was, keeping an already inert one inert', () => {
        const wasInert = node('a');
        wasInert.inert = true;
        const nodes = [wasInert, node('b')];

        makeInert(nodes)();

        expect(nodes.map((n) => n.inert)).toEqual([true, false]);
    });
});
