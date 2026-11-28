import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";
import { frame, later } from "./support.js";

describe("strategies", () => {
    const swap = async (answer, html = `<div id="target" class="t"><span>old</span></div>`) => {
        const page = await mount(button(`$get('/x')`) .replace(`<div id="target">old</div>`, html), {
            server: () => answer,
        });
        page.$("#b").click();
        await page.settle();
        return page;
    };

    const mountSwap = (html, answer) =>
        mount(
            `<div id="d" n-scope="{ hits: 0, gone: [] }">
                <button id="b" n-on-click="$get('/x')"></button>
                ${html}
            </div>`,
            { server: () => answer },
        );

    const swapOnce = async (page) => {
        page.$("#b").click();
        await page.settle();
    };

    const button = (call, scope = "{}") => `
        <div id="d" n-scope="${scope}"><button id="b" n-on-click="${call}"></button></div>
        <div id="target">old</div>
    `;

    it("replaces the element with the same id by default", async () => {
        const page = await swap(`<div id="target"><b>new</b></div>`);
        expect(page.$("#target").outerHTML).toBe(`<div id="target"><b>new</b></div>`);
    });

    it("replaces only the children with n-swap=inner", async () => {
        const page = await swap(`<div id="target" n-swap="inner"><b>new</b></div>`);
        expect(page.$("#target").outerHTML).toBe(`<div id="target" class="t"><b>new</b></div>`);
    });

    it.each([
        ["before", `<b>new</b><div id="target" class="t"><span>old</span></div>`],
        ["after", `<div id="target" class="t"><span>old</span></div><b>new</b>`],
        ["prepend", `<div id="target" class="t"><b>new</b><span>old</span></div>`],
        ["append", `<div id="target" class="t"><span>old</span><b>new</b></div>`],
    ])("puts the children %s the element", async (strategy, expected) => {
        const page = await swap(`<div id="target" n-swap="${strategy}"><b>new</b></div>`);
        expect(page.$("#target").parentElement.innerHTML).toContain(expected);
    });

    it("swaps every element of the answer that has an id", async () => {
        const page = await swap(
            `<div id="target">one</div><div id="d2">two</div>`,
            `<div id="target">old</div><div id="d2">old</div>`,
        );
        expect(page.$("#target").textContent).toBe("one");
        expect(page.$("#d2").textContent).toBe("two");
    });

    it("warns about an element with no id or no target, and skips it", async () => {
        const page = await swap(`<p>no id</p><div id="nowhere">x</div>`);
        expect(page.warnings).toHaveLength(2);
        expect(page.$("#target").textContent).toBe("old");
    });

    it("binds what it swaps in", async () => {
        const page = await swap(
            `<div id="target" n-scope="{ n: 9 }"><span id="s" n-bind-textcontent="n"></span></div>`,
        );
        expect(page.$("#s").textContent).toBe("9");
    });

    it("logs a strategy that only contains a valid one, and goes on with the rest", async () => {
        const page = await mountSwap(
            `<div id="target">old</div><div id="other">old</div>`,
            `<div id="target" n-swap="afterend">new</div><div id="other">new</div>`,
        );
        await swapOnce(page);
        expect(page.$("#target").textContent).toBe("old");
        expect(page.$("#other").textContent).toBe("new");
        expect(page.errors).toHaveLength(1);
    });
});

describe("inner swaps", () => {
    const mountSwap = (html, answer) =>
        mount(
            `<div id="d" n-scope="{ hits: 0, gone: [] }">
                <button id="b" n-on-click="$get('/x')"></button>
                ${html}
            </div>`,
            { server: () => answer },
        );

    const swapOnce = async (page) => {
        page.$("#b").click();
        await page.settle();
    };

    it("binds the target of an inner swap only once", async () => {
        const page = await mountSwap(
            `<div id="target" n-on-ping="hits++"></div>`,
            `<div id="target" n-swap="inner"><span>new</span></div>`,
        );
        await swapOnce(page);
        await swapOnce(page);
        page.$("#target").dispatchEvent(new page.window.Event("ping"));
        expect(page.$("#d").nagiProxy.hits).toBe(1);
    });

    it("keeps the scope of the target of an inner swap, and binds the new children to it", async () => {
        const page = await mount(
            `<button id="b" n-on-click="$get('/x')"></button>
            <div id="target" n-scope="{ n: 1 }"></div>`,
            { server: () => `<div id="target" n-swap="inner"><span id="s" n-bind-textcontent="n"></span></div>` },
        );
        const scope = page.$("#target").nagiProxy;
        scope.n = 5;
        await swapOnce(page);
        expect(page.$("#target").nagiProxy).toBe(scope);
        expect(page.$("#s").textContent).toBe("5");
        scope.n = 6;
        expect(page.$("#s").textContent).toBe("6");
    });
});

describe("cleanup", () => {
    const mountSwap = (html, answer) =>
        mount(
            `<div id="d" n-scope="{ hits: 0, gone: [] }">
                <button id="b" n-on-click="$get('/x')"></button>
                ${html}
            </div>`,
            { server: () => answer },
        );

    const swapOnce = async (page) => {
        page.$("#b").click();
        await page.settle();
    };

    const destroyed = `
        <div id="target" n-on-destroy="gone = [...gone, 'target']">
            <span n-on-destroy="gone = [...gone, 'child']"></span>
        </div>
    `;

    it("dispatches destroy on the bound elements it replaces", async () => {
        const page = await mount(
            `<div n-scope="{ gone: [] }" id="d">
                <button id="b" n-on-click="$get('/x')"></button>
                <div id="target"><span n-on-destroy="gone = [...gone, 'span']"></span></div>
            </div>`,
            { server: () => `<div id="target"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.$("#d").nagiProxy.gone).toEqual(["span"]);
    });

    it("sends destroy to the target and what is in it on an outer swap", async () => {
        const page = await mountSwap(destroyed, `<div id="target"></div>`);
        await swapOnce(page);
        expect(page.$("#d").nagiProxy.gone).toEqual(["target", "child"]);
    });

    it("sends destroy only to the children on an inner swap", async () => {
        const page = await mountSwap(destroyed, `<div id="target" n-swap="inner"></div>`);
        await swapOnce(page);
        expect(page.$("#d").nagiProxy.gone).toEqual(["child"]);
    });

    it.each(["before", "after", "prepend", "append"])("sends no destroy on a %s swap", async (strategy) => {
        const page = await mountSwap(destroyed, `<div id="target" n-swap="${strategy}"><b>new</b></div>`);
        await swapOnce(page);
        expect(page.$("#d").nagiProxy.gone).toEqual([]);
    });

    it("stops the debounce of an element it removed", async () => {
        const page = await mount(
            `<div id="d" n-scope="{ got: [] }">
                <button id="b" n-on-click="$get('/x')"></button>
                <div id="target"><input id="i" n-on-input="$debounce(() => got = [...got, 'ran'], 30)"></div>
            </div>`,
            { server: () => `<div id="target"></div>` },
        );
        page.$("#i").dispatchEvent(new page.window.Event("input"));
        page.$("#b").click();
        await page.settle();
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(page.$("#d").nagiProxy.got).toEqual([]);
    });

    it("removes the window listeners of an element it removed", async () => {
        const target = `<div id="target" n-on-keydown.window="hits++"></div>`;
        const page = await mount(
            `<div id="d" n-scope="{ hits: 0 }">
                <button id="b" n-on-click="$get('/x')"></button>
                ${target}
            </div>`,
            { server: () => target },
        );
        for (let i = 0; i < 3; i++) {
            page.$("#b").click();
            await page.settle();
        }
        page.window.dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "a" }));
        expect(page.$("#d").nagiProxy.hits).toBe(1);
    });
});

describe("cssMorph", () => {
    const swapTwice = async (fragment, before = `<div id="t" class="old"></div>`) => {
        const page = await mount(
            `<div n-scope><button id="b" n-on-click="$get('/x')"></button>${before}</div>`,
            { server: () => fragment },
        );
        for (let i = 0; i < 2; i++) {
            page.$("#b").click();
            await page.settle();
            await later(30);
        }
        return page;
    };

    it("keeps the classes and styles binds set after an outer swap", async () => {
        const page = await mount(
            `<div n-scope n-let-on="true">
                <button id="b" n-on-click="$get('/x')"></button>
                <div id="target" class="card" n-bind-class.active="on" n-bind-style.color="'red'"></div>
            </div>`,
            { server: () => `<div id="target" class="card" n-bind-class.active="on" n-bind-style.color="'red'"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        await frame();
        const target = page.$("#target");
        expect(target.classList.contains("active")).toBe(true);
        expect(target.style.color).toBe("red");
    });

    it("settles the class of an outer swap's bound target, and puts the bound classes back", async () => {
        const page = await mount(
            `<div n-scope n-let-on="true">
                <button id="b" n-on-click="$get('/x')"></button>
                <div id="target" class="card collapsed" n-bind-class.active="on"></div>
            </div>`,
            { server: () => `<div id="target" class="card expanded" n-bind-class.active="on"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        await frame();
        expect([...page.$("#target").classList].sort()).toEqual(["active", "card", "expanded"]);
    });

    it("puts back a className bind after an outer swap", async () => {
        const page = await mount(
            `<div n-scope n-let-cls="'card open'">
                <button id="b" n-on-click="$get('/x')"></button>
                <div id="target" class="card" n-bind-classname="cls"></div>
            </div>`,
            { server: () => `<div id="target" class="card" n-bind-classname="cls"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        await frame();
        expect(page.$("#target").className).toBe("card open");
    });

    it("still settles the class of an outer swap's target from the old to the new", async () => {
        const page = await mount(
            `<div n-scope><button id="b" n-on-click="$get('/x')"></button><div id="target" class="old"></div></div>`,
            { server: () => `<div id="target" class="new"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        await frame();
        expect(page.$("#target").className).toBe("new");
    });

    const watchReflows = (ids) => {
        const reflows = [];
        const beforeInit = (window) => {
            const { get } = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, "offsetWidth");
            Object.defineProperty(window.HTMLElement.prototype, "offsetWidth", {
                configurable: true,
                get() {
                    reflows.push(ids.map((id) => window.document.getElementById(id)?.getAttribute("class")));
                    return get.call(this);
                },
            });
        };
        return { reflows, beforeInit };
    };

    it("has the browser style the old values before the frame that puts the new ones, so transitions run", async () => {
        const { reflows, beforeInit } = watchReflows(["target"]);
        const page = await mount(
            `<div n-scope><button id="b" n-on-click="$get('/x')"></button><div id="target" class="old"></div></div>`,
            { server: () => `<div id="target" class="new"></div>`, beforeInit },
        );
        page.$("#b").click();
        await page.settle();
        expect(reflows).toEqual([["old"]]);
        await frame();
        expect(page.$("#target").className).toBe("new");
    });

    it("styles the old values of every element of an answer with one reflow, and settles them in one frame", async () => {
        const { reflows, beforeInit } = watchReflows(["a", "b1", "s"]);
        const page = await mount(
            `<div n-scope>
                <button id="b" n-on-click="$get('/x')"></button>
                <div id="a" class="old"></div>
                <ul id="list"><li id="b1" class="old"></li></ul>
                <svg id="s" class="old"><circle></circle></svg>
            </div>`,
            {
                server: () =>
                    `<div id="a" class="new"></div><ul id="list" n-swap="inner"><li id="b1" class="new"></li></ul><svg id="s" class="new"><circle></circle></svg>`,
                beforeInit,
            },
        );
        page.$("#b").click();
        await page.settle();
        expect(reflows).toEqual([["old", "old", "old"]]);
        await frame();
        expect(["a", "b1", "s"].map((id) => page.$(`#${id}`).getAttribute("class"))).toEqual(["new", "new", "new"]);
    });

    it("settles an element a later fragment of the same answer swaps again from the page's look", async () => {
        const { reflows, beforeInit } = watchReflows(["c"]);
        const page = await mount(
            `<div n-scope><button id="b" n-on-click="$get('/x')"></button><div id="p"><i id="c" class="a"></i></div></div>`,
            {
                server: () => `<div id="p"><i id="c" class="b"></i></div><div id="p" n-swap="inner"><i id="c" class="c"></i></div>`,
                beforeInit,
            },
        );
        page.$("#b").click();
        await page.settle();
        expect(reflows).toEqual([["a"]]);
        await frame();
        expect(page.$("#c").className).toBe("c");
    });

    it("still settles the fragments swapped before one that throws", async () => {
        const { reflows, beforeInit } = watchReflows(["a"]);
        const page = await mount(
            `<div n-scope><button id="b" n-on-click="$get('/x')"></button><div id="a" class="old"></div><div id="z"></div></div>`,
            {
                server: () => `<div id="a" class="new"></div><div id="z" n-swap="before"><b></b></div>`,
                beforeInit: (window) => {
                    beforeInit(window);
                    window.HTMLElement.prototype.before = () => {
                        throw new window.DOMException("refused", "HierarchyRequestError");
                    };
                },
            },
        );
        page.$("#b").click();
        await page.settle();
        expect(reflows).toEqual([["old"]]);
        await frame();
        expect(page.$("#a").className).toBe("new");
    });

    it("forces no reflow when nothing an answer brings changes its look", async () => {
        const { reflows, beforeInit } = watchReflows(["target"]);
        const page = await mount(
            `<div n-scope><button id="b" n-on-click="$get('/x')"></button><div id="target" class="same"></div></div>`,
            { server: () => `<div id="target" class="same"><span>new</span></div>`, beforeInit },
        );
        page.$("#b").click();
        await page.settle();
        await frame();
        expect(reflows).toEqual([]);
        expect(page.$("#target").textContent).toBe("new");
    });

    it("keeps what other code changes on a swapped element before the frame that settles it", async () => {
        const frames = [];
        const page = await mount(
            `<div n-scope><button id="b" n-on-click="$get('/x')"></button><div id="target" class="old" style="color: red; width: 1px"></div></div>`,
            {
                server: () => `<div id="target" class="new" style="color: blue"></div>`,
                beforeInit: (window) => (window.requestAnimationFrame = (fn) => frames.push(fn)),
            },
        );
        page.$("#b").click();
        await page.settle();
        const target = page.$("#target");
        expect(target.className).toBe("old");
        target.classList.add("extra");
        target.style.setProperty("margin-top", "2px");
        frames.forEach((fn) => fn());
        expect([...target.classList].sort()).toEqual(["extra", "new"]);
        expect([target.style.color, target.style.width, target.style.marginTop]).toEqual(["blue", "", "2px"]);
    });

    const heldFrames = () => {
        const frames = [];
        return { frames, beforeInit: (window) => (window.requestAnimationFrame = (fn) => frames.push(fn)) };
    };

    it("keeps var() shorthands, priorities and changed sizes when other code changed the element before the frame", async () => {
        const { frames, beforeInit } = heldFrames();
        const page = await mount(
            `<div n-scope><button id="b" n-on-click="$get('/x')"></button><div id="target" style="color: red" width="1"></div></div>`,
            { server: () => `<div id="target" style="color: blue !important; padding: var(--gap)" width="2"></div>`, beforeInit },
        );
        page.$("#b").click();
        await page.settle();
        const target = page.$("#target");
        target.style.setProperty("margin-top", "2px");
        target.setAttribute("width", "5");
        frames.forEach((fn) => fn());
        expect([target.style.getPropertyValue("padding"), target.style.getPropertyPriority("color"), target.getAttribute("width")]).toEqual(["var(--gap)", "important", "5"]);
    });

    it("leaves no empty class when the new element has none and other code changed it before the frame", async () => {
        const { frames, beforeInit } = heldFrames();
        const page = await mount(
            `<div n-scope><button id="b" n-on-click="$get('/x')"></button><div id="target" class="a"></div></div>`,
            { server: () => `<div id="target"></div>`, beforeInit },
        );
        page.$("#b").click();
        await page.settle();
        const target = page.$("#target");
        target.classList.add("b");
        target.classList.remove("b");
        frames.forEach((fn) => fn());
        expect(target.hasAttribute("class")).toBe(false);
    });

    it("leaves a style property other code set before the frame, and settles the rest", async () => {
        const { frames, beforeInit } = heldFrames();
        const page = await mount(
            `<div n-scope><button id="b" n-on-click="$get('/x')"></button><div id="target" style="width: 1px; color: red; /* x; y */ height: 1px"></div></div>`,
            { server: () => `<div id="target" style="color: blue"></div>`, beforeInit },
        );
        page.$("#b").click();
        await page.settle();
        const target = page.$("#target");
        target.style.width = "50px";
        frames.forEach((fn) => fn());
        expect([target.style.width, target.style.color, target.style.height]).toEqual(["50px", "blue", ""]);
    });

    it("does not put back a class its bind took off before the frame", async () => {
        const { frames, beforeInit } = heldFrames();
        const page = await mount(
            `<div id="d" n-scope="{ on: true }"><button id="b" n-on-click="$get('/x')"></button><div id="target" class="card"></div></div>`,
            { server: () => `<div id="target" class="card new" n-bind-class="{ active: on }"></div>`, beforeInit },
        );
        page.$("#b").click();
        await page.settle();
        page.scope("#d").on = false;
        frames.forEach((fn) => fn());
        expect(page.$("#target").className).toBe("card new");
        page.scope("#d").on = true;
        expect(page.$("#target").className).toBe("card new active");
    });

    it("keeps a bound class at the frame while its bind still waits for a new value", async () => {
        const { frames, beforeInit } = heldFrames();
        const page = await mount(
            `<div id="d" n-scope="{ async state() { await new Promise(() => {}) } }"><button id="b" n-on-click="$get('/x')"></button><div id="target" class="card"></div></div>`,
            { server: () => `<div id="target" class="card new" n-bind-class="globalThis.first ? state() : (globalThis.first = true, { active: true })"></div>`, beforeInit },
        );
        page.$("#b").click();
        await page.settle();
        frames.forEach((fn) => fn());
        expect(page.$("#target").className).toBe("card new active");
    });

    it("does not put back a class a keyed bind took off before the frame", async () => {
        const { frames, beforeInit } = heldFrames();
        const page = await mount(
            `<div id="d" n-scope="{ on: true }"><button id="b" n-on-click="$get('/x')"></button><div id="target" class="card"></div></div>`,
            { server: () => `<div id="target" class="card new" n-bind-class.active="on ? true : Promise.resolve(false)"></div>`, beforeInit },
        );
        page.$("#b").click();
        await page.settle();
        page.scope("#d").on = false;
        await later(0);
        frames.forEach((fn) => fn());
        expect(page.$("#target").classList.contains("active")).toBe(false);
    });

    it("keeps a class in the new element's markup that a bind also names, and a class a bind adds before the frame", async () => {
        const { frames, beforeInit } = heldFrames();
        const page = await mount(
            `<div id="d" n-scope="{ open: true, active: false }"><button id="b" n-on-click="$get('/x')"></button><div id="target" class="card active"></div></div>`,
            { server: () => `<div id="target" class="card open" n-bind-class="{ open, active }"></div>`, beforeInit },
        );
        page.$("#b").click();
        await page.settle();
        const scope = page.scope("#d");
        scope.active = true;
        frames.forEach((fn) => fn());
        const target = page.$("#target");
        expect([...target.classList].sort()).toEqual(["active", "card", "open"]);
        scope.open = false;
        expect(target.classList.contains("open")).toBe(true);
    });

    it("leaves no class attribute when only a bind gave one and let it go before the frame", async () => {
        const { frames, beforeInit } = heldFrames();
        const page = await mount(
            `<div id="d" n-scope="{ on: true }"><button id="b" n-on-click="$get('/x')"></button><div id="target" class="old"></div></div>`,
            { server: () => `<div id="target" n-bind-class="{ a: on }"></div>`, beforeInit },
        );
        page.$("#b").click();
        await page.settle();
        page.scope("#d").on = false;
        frames.forEach((fn) => fn());
        expect(page.$("#target").hasAttribute("class")).toBe(false);
    });

    it("gives an element torn down before the frame its own classes, and one set up again the classes its new binds hold", async () => {
        const { frames, beforeInit } = heldFrames();
        const page = await mount(
            `<div id="d" n-scope="{ on: true }"><button id="b" n-on-click="$get('/x')"></button><div id="a" class="x"></div><div id="c" class="x"></div></div>`,
            { server: () => `<div id="a" class="card" n-bind-class="{ x: on }"></div><div id="c" class="card" n-bind-class="{ x: on }"></div>`, beforeInit },
        );
        page.$("#b").click();
        await page.settle();
        page.window.nagi.destroy(page.$("#a"));
        page.window.nagi.destroy(page.$("#c"));
        page.window.nagi.init(page.$("#c"));
        frames.forEach((fn) => fn());
        expect([page.$("#a").className, page.$("#c").className]).toEqual(["card", "card x"]);
    });

    it("keeps a class at the frame that any of the binds naming it holds, without running class binds again", async () => {
        const { frames, beforeInit } = heldFrames();
        const page = await mount(
            `<div id="d" n-scope="{ a: true, b: false }"><button id="b" n-on-click="$get('/x')"></button><div id="target" class="old"></div></div>`,
            { server: () => `<div id="target" n-bind-class="{ x: a, runs: (globalThis.classRuns = (globalThis.classRuns ?? 0) + 1) > 0 }" n-bind-class.x="b"></div>`, beforeInit },
        );
        page.$("#b").click();
        await page.settle();
        const before = page.window.classRuns;
        frames.forEach((fn) => fn());
        expect(page.$("#target").classList.contains("x")).toBe(true);
        expect(page.window.classRuns).toBe(before);
    });

    it("keeps the classes of class binds next to a className bind at the frame", async () => {
        const { frames, beforeInit } = heldFrames();
        const page = await mount(
            `<div n-scope="{ on: true }"><button id="b" n-on-click="$get('/x')"></button><div id="target" class="old"></div></div>`,
            { server: () => `<div id="target" n-bind-classname="'base'" n-bind-class="{ active: on }"></div>`, beforeInit },
        );
        page.$("#b").click();
        await page.settle();
        frames.forEach((fn) => fn());
        expect(page.$("#target").className).toBe("base active");
    });

    it("does not put back a class of the markup a keyed bind took off before the frame", async () => {
        const { frames, beforeInit } = heldFrames();
        const page = await mount(
            `<div id="d" n-scope="{ on: true }"><button id="b" n-on-click="$get('/x')"></button><div id="target" class="old"></div></div>`,
            { server: () => `<div id="target" class="card active" n-bind-class.active="on"></div>`, beforeInit },
        );
        page.$("#b").click();
        await page.settle();
        page.scope("#d").on = false;
        frames.forEach((fn) => fn());
        expect(page.$("#target").className).toBe("card");
    });

    it("puts a class a whole bind holds at the frame even when a keyed bind took it off before", async () => {
        const { frames, beforeInit } = heldFrames();
        const page = await mount(
            `<div id="d" n-scope="{ a: true, b: true }"><button id="b" n-on-click="$get('/x')"></button><div id="target" class="x"></div></div>`,
            { server: () => `<div id="target" class="card" n-bind-class="{ x: a }" n-bind-class.x="b"></div>`, beforeInit },
        );
        page.$("#b").click();
        await page.settle();
        page.scope("#d").b = false;
        frames.forEach((fn) => fn());
        expect(page.$("#target").className).toBe("card x");
    });

    it("takes off at the frame a class a bind added before the frame when the element was torn down", async () => {
        const { frames, beforeInit } = heldFrames();
        const page = await mount(
            `<div id="d" n-scope="{ on: false }"><button id="b" n-on-click="$get('/x')"></button><div id="a" class="x"></div></div>`,
            { server: () => `<div id="a" class="card" n-bind-class="{ y: on }"></div>`, beforeInit },
        );
        page.$("#b").click();
        await page.settle();
        page.scope("#d").on = true;
        page.window.nagi.destroy(page.$("#a"));
        frames.forEach((fn) => fn());
        expect(page.$("#a").className).toBe("card");
    });

    it("settles an element torn down but left on the page before the frame to its new look", async () => {
        const { frames, beforeInit } = heldFrames();
        const page = await mount(
            `<div n-scope><button id="b" n-on-click="$get('/x')"></button><div id="target" class="old"></div></div>`,
            { server: () => `<div id="target" class="new"></div>`, beforeInit },
        );
        page.$("#b").click();
        await page.settle();
        const target = page.$("#target");
        page.window.nagi.destroy(target);
        frames.forEach((fn) => fn());
        expect(target.className).toBe("new");
    });

    it("moves an outer swap's element from the one it takes out even when the same id comes earlier in the page", async () => {
        const { reflows, beforeInit } = watchReflows([]);
        const page = await mount(
            `<div n-scope><button id="b" n-on-click="$get('/x')"></button><div id="row" hidden></div><ul id="list"><li id="row" class="old"></li></ul></div>`,
            { server: () => `<ul id="list"><li id="row" class="new"></li></ul>`, beforeInit },
        );
        page.$("#b").click();
        await page.settle();
        expect(reflows).toHaveLength(1);
    });

    it("moves an element added beside the page's elements from no look but its own", async () => {
        const { reflows, beforeInit } = watchReflows(["row"]);
        const page = await mount(
            `<div n-scope><button id="b" n-on-click="$get('/x')"></button><ul id="a"><li id="row" class="highlight"></li></ul><ul id="list"></ul></div>`,
            { server: () => `<ul id="list" n-swap="append"><li id="row" class="plain"></li></ul>`, beforeInit },
        );
        page.$("#b").click();
        await page.settle();
        expect(reflows).toEqual([]);
        expect(page.$("#list > li").className).toBe("plain");
    });

    it("moves an inner swap's new child only from an element the swap took out", async () => {
        const { reflows, beforeInit } = watchReflows([]);
        const page = await mount(
            `<div n-scope><button id="b" n-on-click="$get('/x')"></button><div id="row" class="elsewhere"></div><div id="box"></div></div>`,
            { server: () => `<div id="box" n-swap="inner"><p id="row" class="plain"></p></div>`, beforeInit },
        );
        page.$("#b").click();
        await page.settle();
        expect(reflows).toEqual([]);
        expect(page.$("#box > p").className).toBe("plain");
    });

    it("leaves the target of an inner swap and its wrapper alone, and settles the new children", async () => {
        const page = await mount(
            `<div n-scope>
                <button id="b" n-on-click="$get('/x')"></button>
                <div id="target" class="keep"><p id="p" class="old"></p></div>
            </div>`,
            { server: () => `<div id="target" n-swap="inner" class="wrapper"><p id="p" class="new"></p></div>` },
        );
        page.$("#b").click();
        await page.settle();
        await frame();
        expect(page.$("#target").className).toBe("keep");
        expect(page.$("#p").className).toBe("new");
    });

    it("keeps classes and styles set at init by other code after an outer swap", async () => {
        const page = await mount(
            `<div n-scope>
                <button id="b" n-on-click="$get('/x')"></button>
                <div id="t" class="old" style="color: blue"></div>
            </div>`,
            { server: () => `<div id="t" class="new" style="margin: 1px" n-on-init="$el.classList.add('ready'); $el.style.padding = '2px'"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        await later(30);
        const t = page.$("#t");
        expect([...t.classList].sort()).toEqual(["new", "ready"]);
        expect(t.style.padding).toBe("2px");
        expect(t.style.margin).toBe("1px");
        expect(t.style.color).toBe("");
    });

    it("keeps what init sets when the old element had it too", async () => {
        const page = await swapTwice(`<div id="t" class="new" n-on-init="$el.classList.add('ready'); $el.style.padding = '2px'"></div>`);
        const t = page.$("#t");
        expect([...t.classList].sort()).toEqual(["new", "ready"]);
        expect(t.style.padding).toBe("2px");
    });

    it("keeps a class init takes away from the answer's markup", async () => {
        const page = await swapTwice(`<div id="t" class="loading" n-on-init="$el.classList.remove('loading')"></div>`);
        expect(page.$("#t").classList.contains("loading")).toBe(false);
    });
});

describe("swap messages", () => {
    it("warns about a fragment with no id or no target, and logs an invalid n-swap, each with the fragment", async () => {
        const page = await mount(
            `<div n-scope><button id="b" n-on-click="$get('/x')"></button><div id="t"></div></div>`,
            { server: () => `<p>no id</p><div id="gone"></div><div id="t" n-swap="sideways"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.warnings.map(([message]) => message)).toEqual(["[Nagi] a fragment of the response has no id:", "[Nagi] no element on the page for #gone:"]);
        expect(page.errors.map(([message, strategy]) => [message, strategy])).toEqual([["[Nagi] invalid n-swap:", "sideways"]]);
    });
});

