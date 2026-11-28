import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

describe("n-ref", () => {
    const swapOnce = async (page) => {
        page.$("#b").click();
        await page.settle();
    };

    it("puts the element in its scope's $refs", async () => {
        const page = await mount(`
            <div id="d" n-scope="{}"><input n-ref="field" id="i"></div>
        `);
        expect(page.$("#d").nagiProxy.$refs.field).toBe(page.$("#i"));
    });

    it("forgets the $refs of the children it removes", async () => {
        const page = await mount(
            `<div id="target" n-scope="{}">
                <button id="b" n-on-click="$get('/x')"></button>
                <input n-ref="box">
            </div>`,
            { server: () => `<div id="target" n-swap="inner"><button id="b2"></button></div>` },
        );
        await swapOnce(page);
        expect(page.$("#target").nagiProxy.$refs.box).toBeUndefined();
    });

    it("keeps a ref the new children set under the same name", async () => {
        const page = await mount(
            `<div id="target" n-scope="{}">
                <button id="b" n-on-click="$get('/x')"></button>
                <input n-ref="box">
            </div>`,
            { server: () => `<div id="target" n-swap="inner"><input id="new" n-ref="box"></div>` },
        );
        await swapOnce(page);
        expect(page.$("#target").nagiProxy.$refs.box).toBe(page.$("#new"));
    });

    it("logs an n-ref outside any scope", async () => {
        const page = await mount(`<input id="i" n-ref="field">`);
        expect(page.errors).toHaveLength(1);
    });

    it("finds a ref of an outer scope from an inner one, the nearer scope first", async () => {
        const page = await mount(`
            <div n-scope>
                <dialog n-ref="dialog" id="outer-dialog"></dialog>
                <p n-ref="note" id="outer-note"></p>
                <div id="inner" n-scope><p n-ref="note" id="inner-note"></p></div>
            </div>
        `);
        const refs = page.scope("#inner").$refs;
        expect(refs.dialog).toBe(page.$("#outer-dialog"));
        expect(refs.note).toBe(page.$("#inner-note"));
        expect("dialog" in refs).toBe(true);
    });

    it("puts an element that makes its own scope in the scope around it", async () => {
        const page = await mount(`<div id="d" n-scope><dialog id="dlg" n-scope="{ open: false }" n-ref="dialog"></dialog></div>`);
        expect(page.scope("#d").$refs.dialog).toBe(page.$("#dlg"));
    });

    it("updates binds that read $refs when a ref comes and goes, in its scope and in inner ones", async () => {
        const page = await mount(`
            <div id="d" n-scope>
                <span id="s" n-bind-textcontent="$refs.box ? 'yes' : 'no'"></span>
                <div n-scope><i id="t" n-bind-textcontent="$refs.box ? 'yes' : 'no'"></i></div>
            </div>
        `);
        expect([page.$("#s").textContent, page.$("#t").textContent]).toEqual(["no", "no"]);
        page.$("#d").insertAdjacentHTML("beforeend", `<input id="box" n-ref="box">`);
        page.window.nagi.init(page.$("#box"));
        expect([page.$("#s").textContent, page.$("#t").textContent]).toEqual(["yes", "yes"]);
        page.window.nagi.destroy(page.$("#box"));
        expect([page.$("#s").textContent, page.$("#t").textContent]).toEqual(["no", "no"]);
    });

    it("puts back another element of the same name when the ref it holds goes", async () => {
        const page = await mount(`<div id="d" n-scope><i id="a" n-ref="x"></i><i id="b" n-ref="x"></i></div>`);
        const refs = page.scope("#d").$refs;
        expect(refs.x).toBe(page.$("#b"));
        page.window.nagi.destroy(page.$("#b"));
        expect(refs.x).toBe(page.$("#a"));
        page.window.nagi.destroy(page.$("#a"));
        expect(refs.x).toBeUndefined();
    });

    it("runs no bind of a scope it tears down on the way out", async () => {
        const page = await mount(`<div id="p" n-scope><input n-ref="q" value="v"><span n-bind-textcontent="$refs.q.value"></span></div>`);
        page.window.nagi.destroy(page.$("#p"));
        expect(page.errors).toEqual([]);
    });

    it("does not run a $watch again when nagi.init inside it puts a ref in", async () => {
        const page = await mount(`
            <div id="d" n-scope="{ html: '<i n-ref=&quot;x&quot;></i>', runs: 0 }">
                <div id="box"></div>
                <span n-on-init="$watch(() => { const box = document.getElementById('box'); box.innerHTML = html; nagi.init(box); globalThis.watchRuns = (globalThis.watchRuns ?? 0) + 1 })"></span>
            </div>
        `);
        expect(page.window.watchRuns).toBe(1);
        expect(page.errors).toEqual([]);
    });

    it("hands a name to the last of the others when the element it holds goes", async () => {
        const page = await mount(`<div id="d" n-scope><i id="a" n-ref="x"></i><i id="b" n-ref="x"></i><i id="c" n-ref="x"></i></div>`);
        page.window.nagi.destroy(page.$("#c"));
        expect(page.scope("#d").$refs.x).toBe(page.$("#b"));
    });

    it("keeps the ref of a scope element with no scope around it in its own scope", async () => {
        const page = await mount(`<main id="m" n-scope n-ref="page"></main>`);
        expect(page.scope("#m").$refs.page).toBe(page.$("#m"));
        expect(page.errors).toEqual([]);
    });

    it("never shows a swapped element's ref as missing to binds outside it", async () => {
        const page = await mount(
            `<div id="d" n-scope>
                <button id="b" n-on-click="$get('/x')"></button>
                <span id="s" n-bind-textcontent="$refs.panel.dataset.v"></span>
                <div id="panel" n-ref="panel" data-v="1"></div>
            </div>`,
            { server: () => `<div id="panel" n-ref="panel" data-v="2"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.$("#s").textContent).toBe("2");
        expect(page.errors).toEqual([]);
    });

    it("runs a bind again only for the ref it reads", async () => {
        const page = await mount(`
            <div id="d" n-scope><span n-bind-textcontent="$refs.a ? (globalThis.bindRuns = (globalThis.bindRuns ?? 0) + 1) : 0"></span><i id="a" n-ref="a"></i></div>
        `);
        const before = page.window.bindRuns;
        page.$("#d").insertAdjacentHTML("beforeend", `<i id="z" n-ref="z"></i>`);
        page.window.nagi.init(page.$("#z"));
        page.window.nagi.init(page.$("#a"));
        expect(page.window.bindRuns).toBe(before);
    });

    it("refuses an assignment to $refs with an error, and still drops refs after", async () => {
        const page = await mount(`<div id="d" n-scope><i id="x" n-ref="x"></i><button id="b" n-on-click="$refs = {}"></button></div>`);
        page.$("#b").click();
        page.window.nagi.destroy(page.$("#x"));
        expect(page.scope("#d").$refs.x).toBeUndefined();
        expect(page.errors.map(([message]) => message)).toEqual(["[Nagi] this name is Nagi's own, so it cannot be assigned:"]);
    });

    it("turns $refs into text, and lists the refs of outer scopes too, updating binds that list them", async () => {
        const page = await mount(`
            <div id="d" n-scope>
                <i id="a" n-ref="a"></i>
                <div id="inner" n-scope><i n-ref="b"></i><span id="s" n-bind-textcontent="Object.keys($refs).sort().join() + String($refs).length"></span></div>
            </div>
        `);
        expect(page.$("#s").textContent).toBe("a,b15");
        page.window.nagi.destroy(page.$("#a"));
        expect(page.$("#s").textContent).toBe("b15");
    });

    it("takes __proto__ as a ref name like any other", async () => {
        const page = await mount(`<div id="d" n-scope><i id="p" n-ref="__proto__"></i></div>`);
        const refs = page.scope("#d").$refs;
        expect(refs.__proto__).toBe(page.$("#p"));
        page.window.nagi.destroy(page.$("#p"));
        expect(Object.keys(refs)).toEqual([]);
    });

    it("keeps a name with the last element in the page when an earlier one is added", async () => {
        const page = await mount(`<div id="d" n-scope><div id="top"></div><i id="c" n-ref="x"></i></div>`);
        page.$("#top").insertAdjacentHTML("beforeend", `<i id="a" n-ref="x"></i>`);
        page.window.nagi.init(page.$("#a"));
        expect(page.scope("#d").$refs.x).toBe(page.$("#c"));
    });

    it("updates a bind made during a swap that read a ref the swap changed again", async () => {
        const page = await mount(
            `<div id="d" n-scope>
                <button id="b" n-on-click="$get('/x')"></button>
                <i id="e" n-ref="x"></i><div id="box"></div><div id="other"></div>
            </div>`,
            {
                server: () =>
                    `<div id="box" n-swap="append"><i id="n" n-ref="x"></i></div>` +
                    `<div id="other" n-swap="append"><span id="s" n-bind-textcontent="$refs.x.id"></span></div>` +
                    `<div id="box" n-swap="inner"></div>`,
            },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.$("#s").textContent).toBe("e");
        expect(page.errors).toEqual([]);
    });

    it("updates a bind that asks Object.hasOwn about a ref", async () => {
        const page = await mount(`<div id="d" n-scope><span id="s" n-bind-textcontent="Object.hasOwn($refs, 'x') ? 'yes' : 'no'"></span></div>`);
        page.$("#d").insertAdjacentHTML("beforeend", `<i id="x" n-ref="x"></i>`);
        page.window.nagi.init(page.$("#x"));
        expect(page.$("#s").textContent).toBe("yes");
    });

    it("refuses an assignment to this.$refs in strict code with an error, without throwing", async () => {
        const page = await mount(`<div id="d" n-scope="{ reset() { 'use strict'; this.$refs = {}; } }"><i n-ref="x"></i><button id="b" n-on-click="reset()"></button></div>`);
        page.$("#b").click();
        expect(page.scope("#d").$refs.x).toBeTruthy();
        expect(page.errors.map(([message]) => message)).toEqual(["[Nagi] this name is Nagi's own, so it cannot be assigned:"]);
    });

    it("runs a bind that reads two refs a swap changed once", async () => {
        const page = await mount(
            `<div id="d" n-scope>
                <button id="b" n-on-click="$get('/x')"></button>
                <span n-bind-textcontent="($refs.a, $refs.b, globalThis.pairRuns = (globalThis.pairRuns ?? 0) + 1)"></span>
                <i id="a" n-ref="a"></i><i id="bb" n-ref="b"></i>
            </div>`,
            { server: () => `<i id="a" n-ref="a"></i><i id="bb" n-ref="b"></i>` },
        );
        const before = page.window.pairRuns;
        page.$("#b").click();
        await page.settle();
        expect(page.window.pairRuns).toBe(before + 1);
    });

    it("hands a name to a new element when the one holding it left the page", async () => {
        const page = await mount(`<div id="d" n-scope><div id="top"></div><i id="old" n-ref="x"></i></div>`);
        page.$("#old").remove();
        page.$("#top").insertAdjacentHTML("beforeend", `<i id="new" n-ref="x"></i>`);
        page.window.nagi.init(page.$("#new"));
        expect(page.scope("#d").$refs.x).toBe(page.$("#new"));
    });
});

