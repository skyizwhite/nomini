import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";
import { later } from "./support.js";

describe("nagi.init", () => {
    it("sets up an element another script added, in the scope it was added to", async () => {
        const page = await mount(`<div id="d" n-scope="{ n: 1 }"></div>`);
        const span = page.document.createElement("span");
        span.setAttribute("n-bind-textcontent", "n");
        page.$("#d").append(span);
        expect(span.textContent).toBe("");

        page.window.nagi.init(span);
        expect(span.textContent).toBe("1");
        page.scope("#d").n = 2;
        expect(span.textContent).toBe("2");
    });

    it("sets up an added scope with its fields and refs", async () => {
        const page = await mount(`<div id="d" n-scope="{ outer: 'o' }"></div>`);
        page.$("#d").insertAdjacentHTML(
            "beforeend",
            `<form id="f" n-scope n-form><input name="q" value="hi"><p n-ref="p" n-bind-textcontent="outer + q"></p></form>`,
        );
        page.window.nagi.init(page.$("#f"));
        const scope = page.scope("#f");
        expect(scope.q).toBe("hi");
        expect(scope.$refs.p.textContent).toBe("ohi");
    });

    it("does nothing more the second time", async () => {
        const page = await mount(`
            <form id="f" n-scope="{ hits: 0 }" n-form>
                <input id="q" name="q" value="a">
                <button id="b" type="button" n-on-click="hits++"></button>
            </form>
        `);
        page.window.nagi.init(page.$("#f"));
        page.window.nagi.init(page.document.body);
        page.$("#b").click();
        expect(page.scope("#f").hits).toBe(1);
        expect(page.errors).toEqual([]);
    });

    it("logs an error for something that is not an element", async () => {
        const page = await mount(`<div></div>`);
        page.window.nagi.init(null);
        page.window.nagi.destroy("x");
        expect(page.errors.map(([message]) => message)).toEqual([
            "[Nagi] nagi.init needs an element:",
            "[Nagi] nagi.destroy needs an element:",
        ]);
    });
});

describe("misuse", () => {
    it("logs an error for nagi.init on an element not in the page, and sets it up once it is in", async () => {
        const page = await mount(`<div id="d" n-scope="{ n: 1 }"></div>`);
        const span = page.document.createElement("span");
        span.setAttribute("n-bind-textcontent", "n");
        page.window.nagi.init(span);
        expect(page.errors.map(([message]) => message)).toEqual(["[Nagi] nagi.init needs an element in the page:"]);
        page.$("#d").append(span);
        page.window.nagi.init(span);
        expect(span.textContent).toBe("1");
    });

    it("logs an error for nagi.init on an element of another document", async () => {
        const page = await mount(`<div></div>`);
        const other = new page.window.DOMParser().parseFromString(`<div n-scope="{ n: 2 }"><b n-on-click="n++"></b></div>`, "text/html").body.firstElementChild;
        page.window.nagi.init(other);
        expect(other.nagiProxy ?? null).toBe(null);
        expect(page.errors.map(([message]) => message)).toEqual(["[Nagi] nagi.init needs an element in the page:"]);
    });

    it("refuses an assignment to a helper with an error, and keeps the helper working", async () => {
        let answer;
        const page = await mount(
            `<div id="d" n-scope><button id="a" n-on-click="$fetching = true; $dispatch = null"></button><button id="g" n-on-click="$get('/x')"></button></div>`,
            { server: () => new Promise((resolve) => (answer = resolve)) },
        );
        page.$("#a").click();
        const scope = page.scope("#d");
        expect([scope.$fetching, typeof scope.$dispatch]).toEqual([false, "function"]);
        expect(page.errors.map(([message, name]) => name)).toEqual(["$fetching", "$dispatch"]);
        page.$("#g").click();
        expect(scope.$fetching).toBe(true);
        answer("");
        await page.settle();
        expect(scope.$fetching).toBe(false);
    });

    it("refuses an assignment to a helper from a bind that runs while Nagi updates $fetching", async () => {
        const page = await mount(
            `<div id="d" n-scope><b n-bind-title="$fetching ? ($dispatch = null, 'x') : ''"></b><button id="g" n-on-click="$get('/x')"></button></div>`,
            { server: () => "" },
        );
        page.$("#g").click();
        await page.settle();
        expect(typeof page.scope("#d").$dispatch).toBe("function");
        expect(page.errors.map(([, name]) => name)).toEqual(["$dispatch"]);
    });

    it("logs an error when an n-scope value assigns a name of an outer scope, and leaves it as it was", async () => {
        const page = await mount(`<div id="o" n-scope="{ count: 1 }"><div id="i" n-scope="(count = 5, {})"></div></div>`);
        expect(page.scope("#o").count).toBe(1);
        expect(page.errors.map(([message, name]) => [message, name])).toEqual([["[Nagi] n-scope cannot assign a name of an outer scope:", "count"]]);
    });

    it("logs an error when an n-scope value assigns one of Nagi's names, and makes no global of it", async () => {
        const page = await mount(`<div id="o" n-scope><div id="i" n-scope="($fetching = true, { seen: typeof $get })"></div></div>`);
        expect([page.window.$fetching, page.scope("#o").$fetching, page.scope("#i").seen]).toEqual([undefined, false, "undefined"]);
        expect(page.errors.map(([message, name]) => [message, name])).toEqual([["[Nagi] n-scope cannot assign a name of an outer scope:", "$fetching"]]);
    });
});

describe("nagi.destroy", () => {
    it("tears down an element another script removes, as a swap would", async () => {
        const page = await mount(`
            <div id="d" n-scope="{ n: 1, gone: 0, seen: 0 }">
                <div id="row" n-on-destroy="gone++">
                    <span id="s" n-bind-textcontent="n"></span>
                    <i n-on-ping.window="seen++"></i>
                    <b n-on-click="$debounce(() => seen++, 10)"></b>
                </div>
            </div>
        `);
        const scope = page.scope("#d");
        const row = page.$("#row");
        row.querySelector("b").click();
        page.window.nagi.destroy(row);
        row.remove();

        scope.n = 2;
        page.window.dispatchEvent(new page.window.Event("ping"));
        await later(30);
        expect(scope.gone).toBe(1);
        expect(row.querySelector("#s").textContent).toBe("1");
        expect(scope.seen).toBe(0);
    });

    it("lets an element be set up again after it, with each handler running once", async () => {
        const page = await mount(`
            <form id="f" n-scope="{ hits: 0 }" n-form>
                <div id="row">
                    <input id="q" name="q" value="a">
                    <button id="b" type="button" n-on-click="hits++"></button>
                    <span id="s" n-bind-textcontent="q"></span>
                </div>
            </form>
        `);
        const row = page.$("#row");
        page.window.nagi.destroy(row);
        row.remove();
        page.$("#f").append(row);
        page.window.nagi.init(row);

        page.$("#b").click();
        const q = page.$("#q");
        q.value = "b";
        q.dispatchEvent(new page.window.Event("input"));
        expect(page.scope("#f").hits).toBe(1);
        expect(page.$("#s").textContent).toBe("b");
        expect(page.errors).toEqual([]);
    });

    it("takes a removed element out of $refs when it is destroyed after the removal", async () => {
        const page = await mount(`<div id="d" n-scope><div id="row"><p n-ref="p"></p></div></div>`);
        const row = page.$("#row");
        row.remove();
        page.window.nagi.destroy(row);
        expect(page.scope("#d").$refs.p).toBe(undefined);
    });

    it("makes a scope element set up again run its n-let-* afresh", async () => {
        const page = await mount(`
            <div id="outer" n-scope="{ runs: 0 }">
                <div id="d" n-scope n-let-n="1" n-let-w="$watch(() => { n; runs++ })"></div>
            </div>
        `);
        const outer = page.scope("#outer");
        const d = page.$("#d");
        expect(outer.runs).toBe(1);
        page.window.nagi.destroy(d);
        page.window.nagi.init(d);
        expect(outer.runs).toBe(2);
        d.nagiProxy.n = 2;
        expect(outer.runs).toBe(3);
    });

    it("sets up a field later once the field that held its name is gone", async () => {
        const page = await mount(`<form id="f" n-scope n-form><input id="a" name="q" value="a"></form>`);
        page.$("#f").insertAdjacentHTML("beforeend", `<input id="b" name="q" value="b">`);
        page.window.nagi.init(page.$("#b"));
        expect(page.errors.map(([message]) => message)).toEqual(["[Nagi] another field of the scope has this name:"]);

        page.window.nagi.destroy(page.$("#a"));
        page.$("#a").remove();
        page.window.nagi.init(page.$("#b"));
        const b = page.$("#b");
        b.value = "c";
        b.dispatchEvent(new page.window.Event("input"));
        expect(page.scope("#f").q).toBe("c");
    });

    it("leaves no listener, init or destroy on an element a bind of it tears down during set-up", async () => {
        const page = await mount(`
            <div id="d" n-scope="{ clicks: 0, inits: 0, destroys: 0, once: true }">
                <span id="s" n-on-destroy="destroys++" n-bind-title="nagi.destroy($el)" n-on-click="clicks++" n-on-init="inits++"></span>
                <i id="r" n-bind-title="once && (once = false, nagi.destroy($el), nagi.init($el))" n-on-click="clicks += 10" n-bind-dataset.n="clicks"></i>
            </div>
        `);
        const scope = page.scope("#d");
        page.$("#s").click();
        page.window.nagi.init(page.$("#s"));
        page.$("#s").click();
        expect([scope.clicks, scope.inits, scope.destroys]).toEqual([0, 0, 0]);
        page.$("#r").click();
        expect(scope.clicks).toBe(10);
        expect(page.$("#r").dataset.n).toBe("10");
    });

    it("keeps the binds of an element set up from inside another bind when that bind runs again", async () => {
        const page = await mount(`<div id="d" n-scope="{ k: 1, n: 1 }"><p n-bind-title="k && nagi.init(document.getElementById('x'))"></p></div>`);
        const x = page.document.createElement("span");
        x.id = "x";
        x.setAttribute("n-bind-textcontent", "n");
        page.$("#d").append(x);
        const scope = page.scope("#d");
        scope.k = 2;
        scope.k = 3;
        scope.n = 5;
        expect(x.textContent).toBe("5");
    });

    it("sets up nothing inside a scope element its own n-scope or n-let-* tears down", async () => {
        const page = await mount(`
            <div id="outer" n-scope="{ clicks: 0 }">
                <div id="a" n-scope="{ x: nagi.destroy($el) }"><input name="q" n-ref="r"><span id="sa" n-on-click="clicks++"></span></div>
                <div id="b" n-scope n-let-x="nagi.destroy($el)" n-let-y="clicks = 100"><span id="sb" n-on-click="clicks++"></span></div>
            </div>
        `);
        page.$("#sa").click();
        page.$("#sb").click();
        expect(page.scope("#outer").clicks).toBe(0);
        expect(page.$("#a").nagiProxy ?? page.$("#b").nagiProxy ?? null).toBe(null);
        expect(page.scope("#outer").$refs.r).toBe(undefined);
        expect(page.errors).toEqual([]);
    });

    it("logs nothing about an n-form inside a scope element its n-scope tears down", async () => {
        const page = await mount(`<div n-scope="{ x: nagi.destroy($el) }"><form n-form><input name="q"></form></div>`);
        expect(page.errors).toEqual([]);
    });

    it("keeps one scope for an element its n-scope sets up once more", async () => {
        const page = await mount(`
            <div n-scope>
                <div id="e" n-scope="{ v: 1, x: (globalThis.made = (globalThis.made ?? 0) + 1, made === 1 && nagi.init($el)) }">
                    <span id="s" n-on-click="v++" n-bind-title="v"></span>
                </div>
            </div>
        `);
        page.$("#s").click();
        expect([page.$("#s").title, page.scope("#e").v]).toEqual(["2", 2]);
    });

    it("sets up nothing a swapped-in element tore down in another element of the same swap", async () => {
        const page = await mount(
            `<div id="box" n-scope><button id="b" n-on-click="$get('/x')"></button></div>`,
            {
                server: () =>
                    `<div id="box" n-swap="append"><div n-scope="{ x: nagi.destroy($el.nextElementSibling) }"></div><div n-scope="{ c: 1 }"><span id="t" n-bind-title="'t'"></span></div></div>`,
            },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.$("#t").title).toBe("");
        expect(page.errors).toEqual([]);
    });

    it("sets up nothing a scope expression tore down outside its own element", async () => {
        const page = await mount(`
            <div id="o" n-scope="{ c: 0 }"><div n-scope="{ x: nagi.destroy($el.parentElement) }"></div><span id="t" n-bind-title="'t'"></span></div>
            <div id="p" n-scope="{ c: 0 }"><div n-scope="{ x: nagi.destroy($el.nextElementSibling) }"></div><span id="u" n-bind-title="'u'"></span></div>
        `);
        expect([page.$("#t").title, page.$("#u").title]).toEqual(["", ""]);
        expect(page.errors).toEqual([]);
    });

    it("sends init and then destroy to an element its first bind took off the page once it is set up again", async () => {
        const page = await mount(`
            <div id="d" n-scope="{ inits: 0, destroys: 0, once: true }">
                <span n-bind-title="once && (once = false, globalThis.taken = $el, $el.remove())" n-on-init="inits++" n-on-destroy="destroys++"></span>
            </div>
        `);
        const span = page.window.taken;
        const scope = page.scope("#d");
        page.window.nagi.destroy(span);
        expect([scope.inits, scope.destroys]).toEqual([0, 0]);
        page.$("#d").append(span);
        page.window.nagi.init(span);
        page.window.nagi.destroy(span);
        expect([scope.inits, scope.destroys]).toEqual([1, 1]);
    });

    it("stops an element whose bind sets it up again every time", async () => {
        const page = await mount(`<div n-scope><span id="s" n-bind-title="nagi.destroy($el), nagi.init($el)"></span></div>`);
        expect(page.errors.map(([message]) => message)).toEqual(["[Nagi] stopped setting up an element its own set-up keeps setting up again:"]);
    });

    it("stops an element whose n-scope, n-let-* or init handler sets it up again every time", async () => {
        const page = await mount(`
            <div n-scope>
                <div n-scope="{ x: (nagi.destroy($el), nagi.init($el), 1) }"></div>
                <div n-scope n-let-x="nagi.destroy($el), nagi.init($el), 1"></div>
                <span n-on-init="nagi.destroy($el), nagi.init($el)"></span>
            </div>
        `);
        const message = "[Nagi] stopped setting up an element its own set-up keeps setting up again:";
        expect(page.errors.map(([m]) => m)).toEqual([message, message, message]);
    });

    it("sends one init to an element a bind sets up again once", async () => {
        const page = await mount(`
            <div id="d" n-scope="{ inits: 0, once: true }">
                <span n-bind-title="once && (once = false, nagi.destroy($el), nagi.init($el))" n-on-init="inits++"></span>
            </div>
        `);
        expect(page.scope("#d").inits).toBe(1);
        expect(page.errors).toEqual([]);
    });

    it("sends the events of a request started before its element was set up again to document", async () => {
        let answer;
        const page = await mount(
            `<div id="d" n-scope="{ errs: 0 }"><button id="b" n-on-fetcherr.stop="errs++" n-on-click="$post('/x')"></button></div>`,
            { server: () => new Promise((resolve) => (answer = resolve)) },
        );
        let toDocument = 0;
        page.document.addEventListener("fetcherr", (e) => e.target === page.document && toDocument++);
        const b = page.$("#b");
        b.click();
        page.window.nagi.destroy(b);
        page.window.nagi.init(b);
        answer({ status: 500 });
        await page.settle();
        expect([page.scope("#d").errs, toDocument]).toEqual([0, 1]);
    });
});
