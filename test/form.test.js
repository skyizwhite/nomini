import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";
import { later } from "./support.js";

describe("n-form", () => {
    const form = `
        <form id="f" n-scope="{}" n-form>
            <input name="text" value="hello">
            <input name="count" type="number" value="3">
            <input name="agree" type="checkbox" checked>
            <input name="size" type="radio" value="s">
            <input name="size" type="radio" value="m" checked>
            <select name="pick"><option>a</option><option selected>b</option></select>
            <button id="send">Send</button>
        </form>
    `;

    const swapOnce = async (page) => {
        page.$("#b").click();
        await page.settle();
    };

    it("shows the value of a field a response brings in where the page could not read it before", async () => {
        const page = await mount(
            `<form n-scope n-form>
                <span id="s" n-bind-textcontent="extra"></span>
                <div id="target"></div>
                <button type="button" id="b" n-on-click="$get('/x')"></button>
            </form>`,
            { server: () => `<div id="target"><input name="extra" value="hi"></div>` },
        );
        await swapOnce(page);
        expect(page.$("#s").textContent).toBe("hi");
    });

    it("shows a field a response brings in to watchers with its value alone", async () => {
        const page = await mount(
            `<form id="f" n-scope="{ seen: [] }" n-form n-let-start="$watch(() => seen.push(this.extra))">
                <div id="target"></div>
                <button type="button" id="b" n-on-click="$get('/x')"></button>
            </form>`,
            { server: () => `<div id="target"><input name="extra" value="hi"></div>` },
        );
        await swapOnce(page);
        expect([...page.$("#f").nagiProxy.seen]).toEqual([undefined, "hi"]);
    });

    it("shows an empty field a response brings in where an outer name was read before", async () => {
        const page = await mount(
            `<div n-scope="{ extra: 'x' }">
                <form n-scope n-form>
                    <span id="s" n-bind-textcontent="String(extra)"></span>
                    <div id="target"></div>
                    <button type="button" id="b" n-on-click="$get('/x')"></button>
                </form>
            </div>`,
            { server: () => `<div id="target"><input type="number" name="extra"></div>` },
        );
        expect(page.$("#s").textContent).toBe("x");
        await swapOnce(page);
        expect(page.$("#s").textContent).toBe("undefined");
    });

    it("copies each named field into the scope, typed by input type", async () => {
        const page = await mount(form);
        const scope = page.$("#f").nagiProxy;
        expect(scope.text).toBe("hello");
        expect(scope.count).toBe(3);
        expect(scope.agree).toBe(true);
        expect(scope.size).toBe("m");
        expect(scope.pick).toBe("b");
    });

    it("follows input and change events", async () => {
        const page = await mount(form);
        const input = page.$("[name=text]");
        input.value = "bye";
        input.dispatchEvent(new page.window.Event("input"));
        expect(page.$("#f").nagiProxy.text).toBe("bye");
    });

    it("keeps writing to the name a field had when it was set up", async () => {
        const page = await mount(`<form id="f" n-scope="{ k: 'b' }" n-form><input name="a" n-bind-name="k"></form>`);
        const input = page.$("[name=b]");
        input.value = "z";
        input.dispatchEvent(new page.window.Event("input"));
        expect(page.$("#f").nagiProxy.a).toBe("z");
        expect("b" in page.$("#f").nagiRaw).toBe(false);
    });

    it("leaves the submit buttons alone, so a bind on $fetching disables them", async () => {
        let answer;
        const page = await mount(
            `<form id="f" n-scope n-form>
                <button id="plain"></button>
                <button id="bound" n-bind-disabled="$fetching"></button>
                <button id="go" type="button" n-on-click="$get('/x')"></button>
            </form>`,
            { server: () => new Promise((resolve) => (answer = resolve)) },
        );
        page.$("#go").click();
        expect([page.$("#plain").disabled, page.$("#bound").disabled]).toEqual([false, true]);
        answer("");
        await page.settle();
        expect([page.$("#plain").disabled, page.$("#bound").disabled]).toEqual([false, false]);
    });

    it("logs an n-form outside any scope, and leaves its fields alone", async () => {
        const page = await mount(`
            <form n-form><input name="q" value="a"></form>
            <span id="s" n-bind-textcontent="typeof q"></span>
        `);
        expect(page.$("#s").textContent).toBe("undefined");
        expect(page.errors).toHaveLength(1);
    });

    it("keeps the fields of an n-form inside a scope in that scope", async () => {
        const page = await mount(`<div id="d" n-scope><form n-form><input name="q" value="a"></form></div>`);
        expect(page.$("#d").nagiProxy.q).toBe("a");
        expect(page.$("form").nagiProxy).toBeUndefined();
    });

    it("logs a field named like a helper, and keeps the helper", async () => {
        const page = await mount(`<form id="f" n-scope n-form><input name="$fetching" value="x"></form>`);
        expect(page.$("#f").nagiProxy.$fetching).toBe(false);
        expect(page.errors).toHaveLength(1);
    });

    it("logs a field whose name n-scope or n-let-* already gave the scope, and leaves it out", async () => {
        const page = await mount(`
            <form id="f" n-scope="{ email: 'a@b.c' }" n-let-q="'x'" n-form><input name="email" value="html"><input name="q" value="y"></form>
        `);
        const scope = page.$("#f").nagiProxy;
        expect([scope.email, scope.q]).toEqual(["a@b.c", "x"]);
        expect(page.errors).toHaveLength(2);
    });

    it("writes a scope value into a field only through n-bind-value", async () => {
        const page = await mount(`<form id="f" n-scope n-form><input name="q" value="a" n-bind-value="q"><input name="other" value="o"></form>`);
        const scope = page.$("#f").nagiProxy;
        scope.q = "b";
        scope.other = "x";
        expect(page.$("[name=q]").value).toBe("b");
        expect(page.$("[name=other]").value).toBe("o");
    });

    it("reads the fields again after the form is reset", async () => {
        const page = await mount(`<form id="f" n-scope n-form><input name="q" value="x"></form>`);
        const input = page.$("[name=q]");
        input.value = "y";
        input.dispatchEvent(new page.window.Event("input"));
        page.$("#f").reset();
        await later(10);
        expect(page.$("#f").nagiProxy.q).toBe("x");
    });

    it("does not copy named buttons", async () => {
        const page = await mount(`<form id="f" n-scope n-form><button name="action" value="save"></button></form>`);
        expect("action" in page.$("#f").nagiRaw).toBe(false);
    });

    it("follows a field whose value a bind sets from another field", async () => {
        const page = await mount(`
            <form id="f" n-scope n-form>
                <input id="title" name="title" value="Hello World">
                <input name="slug" n-bind-value="title.toLowerCase().replace(/ /g, '-')">
                <p id="p" n-bind-textcontent="slug"></p>
            </form>
        `);
        expect(page.$("#p").textContent).toBe("hello-world");
        const title = page.$("#title");
        title.value = "Nagi Rocks";
        title.dispatchEvent(new page.window.Event("input"));
        expect(page.scope("#f").slug).toBe("nagi-rocks");
        expect(page.$("#p").textContent).toBe("nagi-rocks");
    });

    it("follows a checkbox, a select and a radio group a bind sets", async () => {
        const page = await mount(`
            <form id="f" n-scope="{ on: true, pick: 'b' }" n-form>
                <input type="checkbox" name="agree" n-bind-checked="on">
                <select name="size"><option value="s">S</option><option value="m" n-bind-selected="on">M</option></select>
                <input type="radio" name="r" value="a"><input type="radio" name="r" value="b" n-bind-checked="pick === 'b'">
            </form>
        `);
        const scope = page.scope("#f");
        expect([scope.agree, scope.size, scope.r]).toEqual([true, "m", "b"]);
        scope.on = false;
        expect([scope.agree, scope.size]).toEqual([false, "s"]);
    });

    it("keeps an assignment to a field's name when another bind of the field runs", async () => {
        const page = await mount(`
            <form id="f" n-scope n-form>
                <input name="q" value="abc" n-bind-class="{ empty: !q }">
                <button id="b" type="button" n-on-click="q = ''"></button>
            </form>
        `);
        page.$("#b").click();
        expect(page.scope("#f").q).toBe("");
    });

    it("keeps a number or a list the scope holds when a bind writes it into its field", async () => {
        const page = await mount(`
            <form id="f" n-scope n-form n-on-init="qty = '5'; tags = ['a,b']">
                <input type="number" name="qty" n-bind-value="qty">
                <select multiple name="tags">
                    <option value="a,b" n-bind-selected="tags.includes('a,b')">ab</option>
                    <option value="a" n-bind-selected="tags.includes('a')">a</option>
                    <option value="b" n-bind-selected="tags.includes('b')">b</option>
                </select>
            </form>
        `);
        const scope = page.scope("#f");
        expect(scope.qty).toBe("5");
        expect(scope.tags).toEqual(["a,b"]);
    });

    it("does not loop on a bind that sets its field from the field's own name, even through a promise", async () => {
        const page = await mount(`
            <form id="f" n-scope n-form>
                <input name="tag" n-bind-value="'#' + (tag ?? '')">
                <input name="late" n-bind-value="Promise.resolve('#' + (late ?? ''))">
            </form>
        `);
        await later(30);
        expect(page.errors).toEqual([]);
        expect([page.scope("#f").tag, page.scope("#f").late]).toEqual(["#", "#"]);
    });

    it("does not overwrite a field while it is being typed in, when another field's bind feeds back", async () => {
        const page = await mount(`
            <form id="f" n-scope n-form>
                <input id="c" name="c" n-bind-value="f == null || f === '' ? c : String((f - 32) * 5 / 9)">
                <input id="fa" name="f" n-bind-value="c == null || c === '' ? f : String(c * 9 / 5 + 32)">
            </form>
        `);
        const c = page.$("#c");
        c.focus();
        c.value = "1.";
        c.dispatchEvent(new page.window.Event("input"));
        expect(c.value).toBe("1.");
        expect(page.$("#fa").value).toBe("33.8");
    });

    it("still updates an option's label while its select handles a change", async () => {
        const page = await mount(`
            <form id="f" n-scope n-form>
                <select id="s" name="size"><option value="s">S</option><option id="m" value="m" n-bind-textcontent="size === 'm' ? 'M (chosen)' : 'M'">M</option></select>
            </form>
        `);
        const select = page.$("#s");
        select.value = "m";
        select.dispatchEvent(new page.window.Event("change"));
        expect(page.$("#m").textContent).toBe("M (chosen)");
    });

    it("does not let a bind's promise write into the field being typed in when it resolves", async () => {
        const page = await mount(`
            <form id="f" n-scope n-form>
                <input id="c" name="c" n-bind-value="Promise.resolve(f == null || f === '' ? c : String((f - 32) * 5 / 9))">
                <input id="fa" name="f" n-bind-value="c == null || c === '' ? f : String(c * 9 / 5 + 32)">
            </form>
        `);
        const c = page.$("#c");
        c.focus();
        c.value = "1.";
        c.dispatchEvent(new page.window.Event("input"));
        await later(20);
        expect(c.value).toBe("1.");
    });

    it("keeps an assignment to a select's name when an option's label bind runs", async () => {
        const page = await mount(`
            <form id="f" n-scope n-form>
                <select name="size"><option value="s">S</option><option value="m" n-bind-textcontent="size === 'm' ? 'M (chosen)' : 'M'">M</option></select>
                <button id="b" type="button" n-on-click="size = 'm'"></button>
            </form>
        `);
        page.$("#b").click();
        expect(page.scope("#f").size).toBe("m");
    });

    it("keeps binds off a field while it has focus, and puts their value in when it leaves", async () => {
        const page = await mount(`
            <form id="f" n-scope="{ cents: 0 }" n-form>
                <input id="a" name="amount" n-on-input="cents = Math.round($el.value * 100)" n-bind-value="cents / 100">
            </form>
        `);
        const a = page.$("#a");
        a.focus();
        a.value = "1.";
        a.dispatchEvent(new page.window.Event("input"));
        expect(a.value).toBe("1.");
        expect(page.scope("#f").cents).toBe(100);
        a.blur();
        expect(a.value).toBe("1");
    });

    it("reads a select again when a bind on its optgroup changes its options", async () => {
        const page = await mount(`
            <form id="f" n-scope="{ opts: '<option value=a>a</option><option value=b selected>b</option>' }" n-form>
                <select name="c"><optgroup n-bind-innerhtml="opts"></optgroup></select>
            </form>
        `);
        const scope = page.scope("#f");
        expect(scope.c).toBe("b");
        scope.opts = "<option value=a>a</option>";
        expect(scope.c).toBe("a");
    });

    it("keeps null in the scope when a bind writes it into a text field", async () => {
        const page = await mount(`<form id="f" n-scope n-form n-on-init="q = null"><input name="q" n-bind-value="q"></form>`);
        expect(page.scope("#f").q).toBeNull();
    });

    it("keeps a focused field from a debounced handler, a wrapper's handler and an earlier promise", async () => {
        let answer;
        const page = await mount(
            `<form id="f" n-scope="{ cents: 0, city: '' }" n-form n-on-input="if ($event.target.name === 'w') cents = 7">
                <input id="a" name="amount" n-on-input.debounce10="cents = Math.round($el.value * 100)" n-bind-value="cents / 100">
                <input id="w" name="w" n-bind-value="cents">
                <input id="c" name="town" n-bind-value="city ? lookup() : ''">
            </form>`,
            { beforeInit: (window) => (window.lookup = () => new Promise((resolve) => (answer = resolve))) },
        );
        const scope = page.scope("#f");
        const a = page.$("#a");
        a.focus();
        a.value = "1.";
        a.dispatchEvent(new page.window.Event("input"));
        await later(30);
        expect(a.value).toBe("1.");

        const w = page.$("#w");
        w.focus();
        w.value = "x";
        w.dispatchEvent(new page.window.Event("input", { bubbles: true }));
        expect(w.value).toBe("x");

        scope.city = "tokyo";
        const c = page.$("#c");
        c.focus();
        c.value = "ky";
        answer("Kyoto");
        await later(10);
        expect(c.value).toBe("ky");
    });

    it("keeps a focused radio group from a bind on another radio of it", async () => {
        const page = await mount(`
            <form id="f" n-scope="{ locked: true }" n-form>
                <input id="ra" type="radio" name="r" value="a"><input type="radio" name="r" value="b" n-bind-checked="r !== 'a' || locked">
            </form>
        `);
        const ra = page.$("#ra");
        ra.focus();
        ra.checked = true;
        ra.dispatchEvent(new page.window.Event("change"));
        expect(page.scope("#f").r).toBe("a");
    });

    it("keeps an empty value the scope holds when its field reads it back as another kind of empty", async () => {
        const page = await mount(`<form id="f" n-scope n-form n-on-init="qty = ''"><input type="number" name="qty" value="5" n-bind-value="qty"></form>`);
        expect(page.scope("#f").qty).toBe("");
    });

    it("keeps what was typed when the field loses focus with no write held back", async () => {
        const page = await mount(`
            <form id="f" n-scope="{ user: { email: 'a@x' } }" n-form><input id="e" name="email" n-bind-value="user.email"></form>
        `);
        const e = page.$("#e");
        e.focus();
        e.value = "new@x";
        e.dispatchEvent(new page.window.Event("input"));
        e.blur();
        expect([e.value, page.scope("#f").email]).toEqual(["new@x", "new@x"]);
    });

    it("keeps a radio choice when focus moves within its group", async () => {
        const page = await mount(`
            <form id="f" n-scope="{ start: 'a' }" n-form>
                <input id="ra" type="radio" name="r" value="a" n-bind-checked="start === 'a'"><input id="rb" type="radio" name="r" value="b">
            </form>
        `);
        const [ra, rb] = [page.$("#ra"), page.$("#rb")];
        ra.focus();
        rb.checked = true;
        rb.focus();
        rb.dispatchEvent(new page.window.Event("change"));
        expect([ra.checked, rb.checked, page.scope("#f").r]).toEqual([false, true, "b"]);
    });

    it("clears the name of a field a swap takes away, and keeps it through a swap that replaces the field", async () => {
        let answer = `<div id="box" n-swap="inner"><input name="q" value="new"></div>`;
        const page = await mount(
            `<form id="f" n-scope n-form>
                <button id="b" type="button" n-on-click="$get('/x')"></button>
                <div id="box"><input name="q" value="old"></div>
                <span id="s" n-bind-textcontent="String(q)"></span>
            </form>`,
            { server: () => answer },
        );
        const scope = page.scope("#f");
        page.$("#b").click();
        await page.settle();
        expect(scope.q).toBe("new");
        expect(page.errors).toEqual([]);

        answer = `<div id="box" n-swap="inner"></div>`;
        page.$("#b").click();
        await page.settle();
        expect(scope.q).toBeUndefined();
        expect(page.$("#s").textContent).toBe("undefined");
        expect(page.errors).toEqual([]);
    });

    it("reads a radio group again when its checked radio is taken away", async () => {
        const page = await mount(`
            <form id="f" n-scope n-form><input id="a" type="radio" name="r" value="a" checked><input type="radio" name="r" value="b"></form>
        `);
        const scope = page.scope("#f");
        expect(scope.r).toBe("a");
        page.window.nagi.destroy(page.$("#a"));
        page.$("#a").remove();
        await later(0);
        expect(scope.r).toBeUndefined();
    });

    it("reads the radio still checked when another of its group goes, and clears a name whose fields left without teardown", async () => {
        const page = await mount(`
            <form id="f" n-scope n-form>
                <input id="a" type="radio" name="r" value="a"><input id="b" type="radio" name="r" value="b"><input id="c" type="radio" name="r" value="c">
            </form>
        `);
        const scope = page.scope("#f");
        page.$("#b").checked = true;
        page.window.nagi.destroy(page.$("#a"));
        page.$("#a").remove();
        await later(0);
        expect(scope.r).toBe("b");

        page.$("#b").remove();
        page.window.nagi.destroy(page.$("#c"));
        page.$("#c").remove();
        await later(0);
        expect(scope.r).toBeUndefined();
    });

    it("clears a radio group whose checked radio had an empty value", async () => {
        const page = await mount(`<form id="f" n-scope n-form><input id="a" type="radio" name="r" value="" checked><input type="radio" name="r" value="b"></form>`);
        page.window.nagi.destroy(page.$("#a"));
        page.$("#a").remove();
        await later(0);
        expect(page.scope("#f").r).toBeUndefined();
    });

    it("keeps a value assigned to a name after its field went, and the name of a field torn down but still in the page", async () => {
        const page = await mount(`<form id="f" n-scope n-form><input id="q" name="q" value="x"><input id="s" name="s" value="y"></form>`);
        const scope = page.scope("#f");
        page.window.nagi.destroy(page.$("#q"));
        page.$("#q").remove();
        scope.q = "kept";
        page.window.nagi.destroy(page.$("#s"));
        await later(0);
        expect([scope.q, scope.s]).toEqual(["kept", "y"]);
    });

    it("clears the name of a swapped-away field once the response is in, after its init handlers", async () => {
        const page = await mount(
            `<form id="f" n-scope="{ seen: 'none' }" n-form>
                <button id="b" type="button" n-on-click="$get('/x')"></button>
                <div id="box"><input name="q" value="old"></div>
            </form>`,
            { server: () => `<div id="box" n-swap="inner"><i n-on-init="seen = String(q)"></i></div>` },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#f").seen).toBe("old");
        expect(page.scope("#f").q).toBeUndefined();
    });

    it("keeps the name of a field one response moves to another fragment", async () => {
        const page = await mount(
            `<form id="f" n-scope="{ seen: [] }" n-form>
                <button id="b" type="button" n-on-click="$get('/x')"></button>
                <div id="a"><input name="q" value="x"></div><div id="c"></div>
            </form>`,
            { server: () => `<div id="a" n-swap="inner"><i n-on-init="seen = [...seen, String(q)]"></i></div><div id="c" n-swap="inner"><input name="q" value="x"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        const scope = page.scope("#f");
        expect(scope.q).toBe("x");
        expect(scope.seen).toEqual(["x"]);
    });

    it("lets a field in an earlier fragment take over the name of one a later fragment takes away", async () => {
        const page = await mount(
            `<form id="f" n-scope n-form>
                <button id="b" type="button" n-on-click="$get('/x')"></button>
                <div id="c"></div><div id="a"><input name="q" value="x"></div>
            </form>`,
            { server: () => `<div id="c" n-swap="inner"><input id="new" name="q" value="y"></div><div id="a" n-swap="inner"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        const scope = page.scope("#f");
        expect(scope.q).toBe("y");
        const input = page.$("#new");
        input.value = "z";
        input.dispatchEvent(new page.window.Event("input"));
        expect(scope.q).toBe("z");
        expect(page.errors).toEqual([]);
    });

    it("never shows undefined for a name a field in an earlier fragment takes over", async () => {
        const page = await mount(
            `<form id="f" n-scope="{ seen: [] }" n-form>
                <button id="b" type="button" n-on-click="$get('/x')"></button>
                <span n-bind-title="seen = [...seen, String(q)]"></span>
                <div id="c"></div><div id="a"><input name="q" value="x"></div>
            </form>`,
            { server: () => `<div id="c" n-swap="inner"><input name="q" value="y"></div><div id="a" n-swap="inner"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        const scope = page.scope("#f");
        expect(scope.q).toBe("y");
        expect(scope.seen).not.toContain("undefined");
    });

    it("clears a name when the later field of that name in the response goes to another scope", async () => {
        const page = await mount(
            `<form id="f" n-scope n-form>
                <button id="b" type="button" n-on-click="$get('/x')"></button>
                <div id="a"><input name="q" value="old"></div>
            </form>
            <form id="g" n-scope n-form><div id="other"></div></form>`,
            { server: () => `<div id="a" n-swap="inner"></div><div id="other" n-swap="inner"><input name="q" value="theirs"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#f").q).toBeUndefined();
        expect(page.scope("#g").q).toBe("theirs");
    });

    it("still logs two fields of one name that a response brings", async () => {
        const page = await mount(
            `<form id="f" n-scope n-form><button id="b" type="button" n-on-click="$get('/x')"></button><div id="box"></div></form>`,
            { server: () => `<div id="box" n-swap="inner"><input name="q"><input name="q"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.errors.map(([message]) => message)).toEqual(["[Nagi] another field of the scope has this name:"]);
    });

    it("writes nothing to a scope torn down with its fields", async () => {
        const page = await mount(`<form id="f" n-scope n-form><input name="q" value="x"></form>`);
        const scope = page.scope("#f");
        page.window.nagi.destroy(page.$("#f"));
        await later(0);
        expect(scope.q).toBe("x");
    });

    it("keeps undefined in the scope when a bind writes it into a text field", async () => {
        const page = await mount(`<form id="f" n-scope n-form n-on-init="q = undefined"><input name="q" n-bind-value="q"></form>`);
        expect(page.scope("#f").q).toBeUndefined();
    });

    it("reads a pair of checkboxes a swap brings in as a list from the start", async () => {
        const page = await mount(
            `<form id="f" n-scope n-form>
                <button id="b" type="button" n-on-click="$get('/x')"></button>
                <span id="s" n-bind-textcontent="t.join(',')"></span>
                <div id="g"><input type="checkbox" name="t" value="a" checked><input type="checkbox" name="t" value="b"></div>
            </form>`,
            { server: () => `<div id="g" n-swap="inner"><input type="checkbox" name="t" value="a" checked><input type="checkbox" name="t" value="b" checked></div>` },
        );
        const seen = [];
        page.scope("#f").$watch(() => seen.push(Array.isArray(page.scope("#f").t) ? "list" : typeof page.scope("#f").t));
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#f").t).toEqual(["a", "b"]);
        expect(page.$("#s").textContent).toBe("a,b");
        expect(seen.slice(1)).not.toContain("boolean");
        expect(page.errors).toEqual([]);
    });

    it("keeps checkboxes of one name in two n-form containers apart, and lets binds set the other boxes of a focused one", async () => {
        const page = await mount(`
            <div id="d" n-scope="{ none: false }">
                <div n-form><input type="checkbox" name="t" value="a" checked></div>
                <div n-form><input type="checkbox" name="t" value="b"></div>
                <div n-form>
                    <input id="vegan" type="checkbox" name="diet" value="vegan" checked n-bind-checked="!none">
                    <input id="none" type="checkbox" name="diet" value="none" n-on-change="none = $el.checked">
                </div>
            </div>
        `);
        expect(page.errors.map(([message]) => message)).toEqual(["[Nagi] another field of the scope has this name:"]);
        const box = page.$("#none");
        box.focus();
        box.checked = true;
        box.dispatchEvent(new page.window.Event("change"));
        expect(page.$("#vegan").checked).toBe(false);
        expect(page.scope("#d").diet).toEqual(["none"]);
    });

    it("counts a checkbox that joins its group later in the same task", async () => {
        const page = await mount(`<form id="f" n-scope n-form><div id="g1"><input type="checkbox" name="t" value="a"></div><div id="g2"></div></form>`);
        const scope = page.scope("#f");
        const a = page.document.querySelector("[value=a]");
        a.dispatchEvent(new page.window.Event("change"));
        page.$("#g2").insertAdjacentHTML("beforeend", `<input id="b" type="checkbox" name="t" value="b" checked>`);
        page.window.nagi.init(page.$("#b"));
        expect(scope.t).toEqual(["b"]);
    });

    it("keeps radios of one form under two n-form containers in one group", async () => {
        const page = await mount(`
            <div id="d" n-scope><form id="f" n-form><input type="radio" name="r" value="1"></form><div n-form><input type="radio" form="f" name="r" value="2" checked></div></div>
        `);
        expect(page.errors).toEqual([]);
        expect(page.scope("#d").r).toBe("2");
    });

    it("counts only the checkboxes set up as fields", async () => {
        const page = await mount(`<form id="f" n-scope n-form><input id="a" type="checkbox" name="t" value="a" checked><input id="b" type="checkbox" name="t" value="b" checked></form>`);
        const scope = page.scope("#f");
        page.window.nagi.destroy(page.$("#b"));
        page.$("#f").insertAdjacentHTML("beforeend", `<input type="checkbox" name="t" value="c" checked>`);
        const a = page.$("#a");
        a.dispatchEvent(new page.window.Event("change"));
        expect(scope.t).toBe(true);
    });

    it("counts a disabled checkbox in its group", async () => {
        const page = await mount(`
            <form id="f" n-scope n-form><input type="checkbox" name="t" value="a" checked><input type="checkbox" name="t" value="b" disabled></form>
        `);
        expect(page.scope("#f").t).toEqual(["a"]);
    });

    it("logs fields other than radios and checkboxes that share a name, and reads only the first", async () => {
        const page = await mount(`
            <form id="f" n-scope n-form>
                <input type="hidden" name="ids" value="1"><input type="hidden" name="ids" value="2">
                <input type="checkbox" name="mix" value="a"><input type="text" name="mix">
            </form>
        `);
        const scope = page.$("#f").nagiProxy;
        expect([scope.ids, scope.mix]).toEqual(["1", false]);
        expect(page.errors).toHaveLength(2);
    });

    it("reads checkboxes that share a name as the list of the checked values, and a lone one as true or false", async () => {
        const page = await mount(`
            <form id="f" n-scope="{ pick: [] }" n-form>
                <input id="a" type="checkbox" name="t" value="a" checked><input id="b" type="checkbox" name="t" value="b">
                <input type="checkbox" name="c" value="z" n-bind-checked="pick.includes('z')"><input type="checkbox" name="c" value="y">
                <input type="checkbox" name="agree">
            </form>
        `);
        const scope = page.scope("#f");
        expect([scope.t, scope.c, scope.agree]).toEqual([["a"], [], false]);
        const b = page.$("#b");
        b.checked = true;
        b.dispatchEvent(new page.window.Event("change"));
        expect(scope.t).toEqual(["a", "b"]);
        scope.pick = ["z"];
        expect(scope.c).toEqual(["z"]);
        page.window.nagi.destroy(b);
        b.remove();
        await later(0);
        expect(scope.t).toBe(true);
    });

    it("lets a field a swap brings in take the name of the one it replaced", async () => {
        const page = await mount(
            `<form id="f" n-scope n-form><div id="g"><input name="q" value="old"></div><button id="b" type="button" n-on-click="$get('/x')"></button></form>`,
            { server: () => `<div id="g"><input name="q" value="new"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.$("#f").nagiProxy.q).toBe("new");
        expect(page.errors).toEqual([]);
    });

    it("does not copy named input buttons", async () => {
        const page = await mount(`
            <form id="f" n-scope n-form><input type="submit" name="act" value="Save"><input type="submit" name="act" value="Delete"></form>
        `);
        expect("act" in page.$("#f").nagiRaw).toBe(false);
        expect([...page.window.document.querySelectorAll("[name=act]")].map((el) => el.value)).toEqual(["Save", "Delete"]);
    });

    it("stops following resets for a field a swap removed", async () => {
        const page = await mount(
            `<form id="f" n-scope n-form>
                <div id="extra"><input name="coupon" value="X"></div>
                <button id="b" type="button" n-on-click="$get('/x')"></button>
            </form>`,
            { server: () => `<div id="extra"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        page.$("#f").nagiProxy.coupon = "gone";
        page.$("#f").reset();
        await later(10);
        expect(page.$("#f").nagiProxy.coupon).toBe("gone");
    });

    it("reads only native fields, leaving outputs and custom elements to n-on-*", async () => {
        const page = await mount(
            `<form id="f" n-scope n-form><output name="total">3</output><x-pick name="pick"></x-pick></form>`,
            { beforeInit: (window) => window.customElements.define("x-pick", class extends window.HTMLElement { value = "p"; }) },
        );
        expect(["total" in page.$("#f").nagiRaw, "pick" in page.$("#f").nagiRaw]).toEqual([false, false]);
    });

    it("reads a checkbox as a boolean, whether or not it has a value", async () => {
        const page = await mount(`<form id="f" n-scope n-form><input type="checkbox" name="agree" value="yes"></form>`);
        expect(page.$("#f").nagiProxy.agree).toBe(false);
    });

    it("reads a multiple select as the list of the selected values", async () => {
        const page = await mount(`
            <form id="f" n-scope n-form><select name="s" multiple><option selected>a</option><option selected>b</option><option>c</option></select></form>
        `);
        expect([...page.$("#f").nagiProxy.s]).toEqual(["a", "b"]);
    });

    it("logs a field named like a getter of the scope", async () => {
        const page = await mount(`<form id="f" n-scope="{ get total() { return 5 } }" n-form><input name="total" value="3"></form>`);
        expect(page.$("#f").nagiProxy.total).toBe(5);
        expect(page.errors).toHaveLength(1);
    });

    it("leaves alone a named custom element that is not a field, such as an icon", async () => {
        const page = await mount(`<form id="f" n-scope="{ search: 'foo' }" n-form><sl-icon name="search"></sl-icon></form>`);
        expect(page.$("#f").nagiProxy.search).toBe("foo");
    });

    it("resets a radio group to its default whatever order the radios come in", async () => {
        const page = await mount(`
            <form id="f" n-scope n-form><input type="radio" name="s" value="a"><input type="radio" name="s" value="b" checked></form>
        `);
        const [a, b] = page.window.document.querySelectorAll("[name=s]");
        a.checked = true;
        a.dispatchEvent(new page.window.Event("change"));
        expect(page.$("#f").nagiProxy.s).toBe("a");
        page.$("#f").reset();
        await later(10);
        expect([a.checked, b.checked, page.$("#f").nagiProxy.s]).toEqual([false, true, "b"]);
    });

    it("reads an empty number field as undefined, so it can be cleared", async () => {
        const page = await mount(`<form id="f" n-scope n-form><input type="number" name="n" value="5" n-bind-value="n ?? ''"></form>`);
        const input = page.$("[name=n]");
        input.value = "";
        input.dispatchEvent(new page.window.Event("input"));
        expect(input.value).toBe("");
        expect(page.$("#f").nagiProxy.n).toBeUndefined();
    });

    it("leaves ignored radios out of a radio group", async () => {
        const page = await mount(`
            <form id="f" n-scope n-form><input id="a" type="radio" name="s" value="a"><div n-ignore><input type="radio" name="s" value="z" checked></div></form>
        `);
        expect(page.$("#f").nagiProxy.s).toBeUndefined();
        page.$("#a").checked = true;
        page.$("#a").dispatchEvent(new page.window.Event("change"));
        expect(page.$("#f").nagiProxy.s).toBe("a");
    });

    it("logs radios of one name in different forms of a scope, and keeps the first form's", async () => {
        const page = await mount(`
            <div id="d" n-scope n-form>
                <form><input type="radio" name="s" value="a" checked></form>
                <form><input type="radio" name="s" value="b" checked></form>
            </div>
        `);
        expect(page.$("#d").nagiProxy.s).toBe("a");
        expect(page.errors).toHaveLength(1);
    });

    it("has read the fields by the time binds and init handlers first run", async () => {
        const page = await mount(`
            <form n-scope="{ seen: null }" n-form>
                <input name="q" value="x"><span id="s" n-on-init="seen = q" n-bind-textcontent="q.toUpperCase()"></span>
            </form>
        `);
        expect(page.$("#s").textContent).toBe("X");
        expect(page.scope("#s").seen).toBe("x");
        expect(page.errors).toEqual([]);
    });

    it("takes a field named like an Object.prototype member from the field", async () => {
        const page = await mount(`<form id="f" n-scope="{ a: 1 }" n-form><input name="constructor" value="x"></form>`);
        expect(page.$("[name=constructor]").value).toBe("x");
        expect(page.$("#f").nagiProxy.constructor).toBe("x");
    });

    it("clears a radio group's name when a reset leaves none of it checked", async () => {
        const page = await mount(`<form id="f" n-scope n-form><input id="a" type="radio" name="s" value="a"><input type="radio" name="s" value="b"></form>`);
        const a = page.$("#a");
        a.checked = true;
        a.dispatchEvent(new page.window.Event("change"));
        expect(page.$("#f").nagiProxy.s).toBe("a");
        page.$("#f").reset();
        await later(10);
        expect(page.$("#f").nagiProxy.s).toBeUndefined();
    });

    it("keeps what an init handler sets for a field's name", async () => {
        const page = await mount(`<form id="f" n-scope n-form n-on-init="q = 'preset'"><input name="q"></form>`);
        expect(page.$("#f").nagiProxy.q).toBe("preset");
    });

    it("leaves ignored radios out when a reset reads a radio group", async () => {
        const page = await mount(`
            <form id="f" n-scope n-form><input id="a" type="radio" name="s" value="a"><div n-ignore><input type="radio" name="s" value="z" checked></div></form>
        `);
        const a = page.$("#a");
        a.checked = true;
        a.dispatchEvent(new page.window.Event("change"));
        page.$("#f").reset();
        await later(10);
        expect(page.$("#f").nagiProxy.s).toBeUndefined();
    });

    it("keeps the type of a value an init handler set when a bind writes it into its field", async () => {
        const page = await mount(`<form id="f" n-scope n-form n-on-init="n = 5"><input name="n" n-bind-value="n"></form>`);
        expect(page.$("#f").nagiProxy.n).toBe(5);
    });

    it("forgets a field another script removed, so its name can be taken again", async () => {
        const page = await mount(`<form id="f" n-scope n-form><input id="a" type="radio" name="s" value="a" checked><input id="b" type="radio" name="s" value="b"></form>`);
        page.$("#a").remove();
        page.$("#b").checked = true;
        page.$("#b").dispatchEvent(new page.window.Event("change"));
        expect(page.$("#f").nagiProxy.s).toBe("b");
    });

    it("follows the reset of the form a field names with form=, even after that form is swapped", async () => {
        const page = await mount(
            `<div n-scope n-form id="d">
                <form id="f"></form><input name="q" form="f" value="x">
                <button id="b" type="button" n-on-click="$get('/x')"></button>
            </div>`,
            { server: () => `<form id="f"></form>` },
        );
        page.$("#b").click();
        await page.settle();
        const input = page.$("[name=q]");
        input.value = "typed";
        input.dispatchEvent(new page.window.Event("input"));
        page.$("#f").reset();
        await later(10);
        expect(page.$("#d").nagiProxy.q).toBe("x");
    });

    it("stops reading a field that left the page once another field has taken its name", async () => {
        const page = await mount(
            `<form id="f" n-scope n-form><input id="a" name="q" value="1"><div id="w"></div><button id="b" type="button" n-on-click="$get('/x')"></button></form>`,
            { server: () => `<div id="w"><input name="q" value="2"></div>` },
        );
        const a = page.$("#a");
        a.remove();
        page.$("#b").click();
        await page.settle();
        page.$("#f").append(a);
        a.value = "3";
        a.dispatchEvent(new page.window.Event("input"));
        expect(page.$("#f").nagiProxy.q).toBe("2");
    });

    it("keeps the checked radio's value when an unchecked one comes after it", async () => {
        const page = await mount(`
            <form id="f" n-scope="{}" n-form>
                <input type="radio" name="c" value="a" checked>
                <input type="radio" name="c" value="b">
            </form>
        `);
        expect(page.$("#f").nagiProxy.c).toBe("a");
    });

    it("still defines the group's key", async () => {
        const page = await mount(`
            <form n-scope="{}" n-form>
                <input type="radio" name="c" value="a">
                <input type="radio" name="c" value="b">
                <span id="s" n-bind-textcontent="c ?? 'none'"></span>
            </form>
        `);
        expect(page.$("#s").textContent).toBe("none");
        expect(page.errors).toEqual([]);
    });

    it("keeps the fields of an inner n-form in the form's scope", async () => {
        const page = await mount(`
            <div id="outer" n-scope="{ name: 'Page title' }">
                <form id="f" n-scope n-form><input name="name" value="typed"></form>
            </div>
        `);
        expect(page.$("#outer").nagiProxy.name).toBe("Page title");
        expect(page.$("#f").nagiProxy.name).toBe("typed");
    });

    it("wires the new fields of an n-form target", async () => {
        const page = await mount(
            `<div n-scope="{}">
                <button id="b" type="button" n-on-click="$get('/x')"></button>
                <form id="target" n-form></form>
            </div>`,
            { server: () => `<form id="target" n-swap="inner"><input name="q" value="hi"></form>` },
        );
        await swapOnce(page);
        const scope = page.scope("#target");
        expect(scope.q).toBe("hi");

        const input = page.$("[name=q]");
        input.value = "bye";
        input.dispatchEvent(new page.window.Event("input"));
        expect(scope.q).toBe("bye");
    });

    it("wires the fields swapped into an element inside an n-form", async () => {
        const page = await mount(
            `<form n-scope="{}" n-form>
                <button id="b" type="button" n-on-click="$get('/x')"></button>
                <div id="target"></div>
            </form>`,
            { server: () => `<div id="target" n-swap="inner"><input name="q" value="hi"></div>` },
        );
        await swapOnce(page);
        expect(page.scope("#target").q).toBe("hi");
    });
});
