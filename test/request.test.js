import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";
import { later } from "./support.js";

describe("what is sent", () => {
    const button = (call, scope = "{}") => `
        <div id="d" n-scope="${scope}"><button id="b" n-on-click="${call}"></button></div>
        <div id="target">old</div>
    `;

    const send = async (call, html = "", options = {}) => {
        const page = await mount(
            `<div n-scope>${html}<button id="b" n-on-click="${call}"></button></div>`,
            { server: () => "", ...options },
        );
        page.$("#b").click();
        await page.settle();
        return page;
    };

    it("$get sends the data in the query string with the n-request header", async () => {
        const page = await mount(button(`$get('/x', { q: 'a b' })`), { server: () => "" });
        page.$("#b").click();
        await page.settle();

        const [request] = page.requests;
        expect(request.method).toBe("GET");
        expect(request.url).toBe("http://localhost/x?q=a+b");
        expect(request.headers["n-request"]).toBe("true");
    });

    it("$post sends the data as a urlencoded body", async () => {
        const page = await mount(button(`$post('/x', { q: 'a' })`), { server: () => "" });
        page.$("#b").click();
        await page.settle();

        const [request] = page.requests;
        expect(request.method).toBe("POST");
        expect(request.url).toBe("http://localhost/x");
        expect(request.body).toBe("q=a");
    });

    it.each([
        ["$put", "PUT"],
        ["$patch", "PATCH"],
    ])("%s sends the data as a urlencoded body", async (helper, method) => {
        const page = await mount(button(`${helper}('/x', { q: 'a' })`), { server: () => "" });
        page.$("#b").click();
        await page.settle();

        const [request] = page.requests;
        expect(request.method).toBe(method);
        expect(request.url).toBe("http://localhost/x");
        expect(request.body).toBe("q=a");
    });

    it("$delete sends the data in the query string", async () => {
        const page = await mount(button(`$delete('/x', { q: 'a' })`), { server: () => "" });
        page.$("#b").click();
        await page.settle();

        const [request] = page.requests;
        expect(request.method).toBe("DELETE");
        expect(request.url).toBe("http://localhost/x?q=a");
        expect(request.body ?? "").toBe("");
    });

    it("sends none of the scope's values unless they are passed", async () => {
        const page = await mount(button(`$get('/x')`, "{ name: 'n', list: [1, 2] }"), { server: () => "" });
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].url).toBe("http://localhost/x");
    });

    it("sends no data-* unless passed, and sends what $dataset() gives when it is", async () => {
        const page = await mount(
            `<div n-scope="{}" data-from-scope="s">
                <button id="a" data-from-button="b" n-on-click="$get('/x')"></button>
                <button id="b" data-from-button="b" n-on-click="$get('/y', $dataset())"></button>
            </div>`,
            { server: () => "" },
        );
        page.$("#a").click();
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].url).toBe("http://localhost/x");
        const query = new URL(page.requests[1].url).searchParams;
        expect(query.get("fromScope")).toBe("s");
        expect(query.get("fromButton")).toBe("b");
    });

    it("lets the call's data win over the scope's", async () => {
        const page = await mount(button(`$get('/x', { name: 'call' })`, "{ name: 'scope' }"), { server: () => "" });
        page.$("#b").click();
        await page.settle();
        expect(new URL(page.requests[0].url).searchParams.get("name")).toBe("call");
    });

    it("is not called to make a request's data", async () => {
        const page = await mount(
            `<div n-scope n-let-count="1" n-let-add="(n) => count += n">
                <button id="b" n-on-click="$post('/x', { count })"></button>
            </div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#b").count).toBe(1);
        expect(page.requests[0].body).toBe("count=1");
    });

    it("sends the scope's current value of a data-* it is passed", async () => {
        const page = await mount(
            `<div n-scope data-page="1"><button id="b" n-on-click="page = '2'; $get('/list', { page })"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(new URL(page.requests[0].url).searchParams.get("page")).toBe("2");
    });

    it("sends a closer element's data-* over the scope's from $dataset()", async () => {
        const page = await mount(
            `<div n-scope data-id="0"><button id="b" data-id="5" n-on-click="$get('/row', $dataset())"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(new URL(page.requests[0].url).searchParams.get("id")).toBe("5");
    });

    it("repeats the key for each item of an array, and leaves out null and undefined", async () => {
        const page = await send(`$get('/x', { tags: ['a', 'b'], none: null, gone: undefined, n: 0 })`);
        expect(page.requests[0].url).toBe("http://localhost/x?tags=a&tags=b&n=0");
    });

    it("sends the fields of a form element as FormData", async () => {
        const page = await mount(
            `<form id="f" n-scope n-on-submit.prevent="$post('/save', $el)">
                <input name="title" value="Hi">
                <input name="tag" value="a"><input name="tag" value="b">
            </form>`,
            { server: () => "" },
        );
        page.$("#f").dispatchEvent(new page.window.Event("submit", { cancelable: true }));
        await page.settle();
        expect(page.requests[0].body).toEqual([["title", "Hi"], ["tag", "a"], ["tag", "b"]]);
    });

    it("sends a form element as its fields, though a browser's form can be iterated", async () => {
        const page = await mount(
            `<form id="f" n-scope>
                <input name="title" value="Hi">
                <input name="tag" value="a"><input name="tag" value="b">
            </form>`,
            { server: () => "" },
        );
        const form = page.$("#f");
        form[Symbol.iterator] = function* () {
            yield* this.elements;
        };
        form.nagiProxy.$post("/save", form);
        await page.settle();
        expect(page.requests[0].body).toEqual([["title", "Hi"], ["tag", "a"], ["tag", "b"]]);
    });

    it("sends a file in FormData", async () => {
        const page = await mount(`<div id="f" n-scope></div>`, { server: () => "" });
        const file = new page.window.File(["hello"], "a.txt", { type: "text/plain" });
        const data = new page.window.FormData();
        data.append("doc", file);
        page.$("#f").nagiProxy.$post("/upload", data);
        await page.settle();
        const [[name, sent]] = page.requests[0].body;
        expect(name).toBe("doc");
        expect(sent.name).toBe("a.txt");
    });

    it("sends FormData and URLSearchParams as they are", async () => {
        const page = await send(
            `$post('/a', (() => { const f = new FormData(); f.append('k', 'v'); return f })()); $post('/b', new URLSearchParams('x=1&x=2'))`,
        );
        expect(page.requests[0].body).toEqual([["k", "v"]]);
        expect(page.requests[1].body).toBe("x=1&x=2");
    });

    it("puts FormData in the query of a GET, leaving out files", async () => {
        const page = await send(
            `$get('/x', (() => { const f = new FormData(); f.append('q', 'a'); f.append('doc', new File(['x'], 'x.txt')); return f })())`,
        );
        expect(page.requests[0].url).toBe("http://localhost/x?q=a");
    });

    it("sends files inside an object as FormData, a FileList as its files", async () => {
        const page = await mount(`<div id="d" n-scope></div>`, { server: () => "" });
        const window = page.window;
        const a = new window.File(["1"], "a.txt");
        const b = new window.File(["2"], "b.txt");
        page.$("#d").nagiProxy.$post("/up", { title: "x", doc: a, docs: [b] });
        await page.settle();
        expect(page.requests[0].body.map(([k, v]) => [k, typeof v === "string" ? v : v.name])).toEqual([
            ["title", "x"],
            ["doc", "a.txt"],
            ["docs", "b.txt"],
        ]);
    });

    it("warns about an object value that is not a file, and leaves it out", async () => {
        const page = await send(`$get('/x', { a: 1, nested: { b: 2 } })`);
        expect(page.requests[0].url).toBe("http://localhost/x?a=1");
        expect(page.warnings).toHaveLength(1);
    });

    it("sends the form an element is in when the element is passed", async () => {
        const page = await mount(
            `<form n-scope><input name="q" value="hi"><button id="b" type="button" n-on-click="$post('/x', $el)"></button></form>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].body).toEqual([["q", "hi"]]);
    });

    it("warns about an element or event in no form, and sends no data", async () => {
        const page = await send(`$post('/x', $el); $get('/y', e)`);
        expect(page.requests.map((r) => [r.url, r.body])).toEqual([
            ["http://localhost/x", ""],
            ["http://localhost/y", undefined],
        ]);
        expect(page.warnings).toHaveLength(2);
    });

    it("sends the submitter of a submit event it is passed", async () => {
        const page = await mount(
            `<form id="f" n-scope n-on-submit.prevent="$post('/x', e)">
                <input name="q" value="hi">
                <button id="del" name="action" value="delete">Delete</button>
            </form>`,
            { server: () => "" },
        );
        const event = new page.window.SubmitEvent("submit", { cancelable: true, submitter: page.$("#del") });
        page.$("#f").dispatchEvent(event);
        await page.settle();
        expect(page.requests[0].body).toEqual([["q", "hi"], ["action", "delete"]]);
    });

    it("sends objects that turn into text, such as a Date or a URL, as their text", async () => {
        const page = await send(`$get('/x', { at: new URL('/p', location.href), n: { toString: () => 'n1' } })`);
        expect(page.requests[0].url).toBe("http://localhost/x?at=http%3A%2F%2Flocalhost%2Fp&n=n1");
        expect(page.warnings).toEqual([]);
    });

    it("sends a Date as its ISO text, and warns about an invalid one", async () => {
        const page = await send(`$get('/x', { at: new Date(Date.UTC(2026, 10, 28, 1, 2, 3)), bad: new Date('no') })`);
        expect(page.requests[0].url).toBe("http://localhost/x?at=2026-11-28T01%3A02%3A03.000Z");
        expect(page.warnings.map(([message, key]) => [message, key])).toEqual([["[Nagi] cannot send:", "bad"]]);
    });

    it("leaves out functions without a warning, and warns about a symbol", async () => {
        const page = await send(`$get('/x', { a: 1, run() {}, s: Symbol('s') })`);
        expect(page.requests[0].url).toBe("http://localhost/x?a=1");
        expect(page.warnings.map(([message, key]) => [message, key])).toEqual([["[Nagi] cannot send:", "s"]]);
    });

    it("warns about values that only claim to be a Date or cannot turn into text, and still sends the rest", async () => {
        const page = await send(
            `$get('/x', { a: 1, fake: { [Symbol.toStringTag]: 'Date' }, bare: Object.create(null), wrapped: new Proxy(new Date(0), {}) })`,
        );
        expect(page.requests[0].url).toBe("http://localhost/x?a=1");
        expect(page.warnings.map(([message, key]) => [message, key])).toEqual([
            ["[Nagi] cannot send:", "fake"],
            ["[Nagi] cannot send:", "bare"],
            ["[Nagi] cannot send:", "wrapped"],
        ]);
        expect(page.errors).toEqual([]);
    });

    it("sends only the scope's own names when the scope itself is passed", async () => {
        const page = await mount(
            `<div n-scope="{ name: 'a', save() {} }" n-let-n="2"><button id="b" n-on-click="$post('/x', this)"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].body).toBe("name=a&n=2");
        expect(page.warnings).toEqual([]);
    });

    it("leaves out a getter of the scope that throws, with a warning, and sends the rest", async () => {
        const page = await mount(
            `<div n-scope="{ items: null, name: 'a', get count() { return this.items.length } }"><button id="b" n-on-click="$post('/x', this)"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].body).toBe("name=a");
        expect(page.warnings.map(([message, key]) => [message, key])).toEqual([["[Nagi] cannot send:", "count"]]);
    });

    it("sends an inner scope as an object even when an outer scope has names an element or event has", async () => {
        const page = await mount(
            `<div n-scope="{ nodeType: 1, preventDefault() {}, append() {} }"><div n-scope="{ name: 'a' }"><button id="b" n-on-click="$post('/x', this)"></button></div></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].body).toBe("name=a");
        expect(page.warnings).toEqual([]);
    });

    it("sends nothing of a scopeless element's own scope when it is passed", async () => {
        const page = await mount(`<button id="b" n-on-click="$post('/x', this)"></button>`, { server: () => "" });
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].body).toBe("");
        expect(page.warnings).toEqual([]);
    });

    it("sends the name and value of the button a click came from", async () => {
        const page = await mount(
            `<form n-scope><input name="q" value="hi">
                <button id="b" type="button" name="action" value="delete" n-on-click="$post('/x', e)"><span id="inner">Del</span></button>
            </form>`,
            { server: () => "" },
        );
        page.$("#inner").click();
        await page.settle();
        expect(page.requests[0].body).toEqual([["q", "hi"], ["action", "delete"]]);
    });

    it("warns about files given to a GET", async () => {
        const page = await mount(`<div id="d" n-scope></div>`, { server: () => "" });
        page.$("#d").nagiProxy.$get("/x", { q: "a", doc: new page.window.File(["1"], "a.txt") });
        await page.settle();
        expect(page.requests[0].url).toBe("http://localhost/x?q=a");
        expect(page.warnings).toHaveLength(1);
    });

    it("reads a string as a query", async () => {
        const page = await send(`$get('/x', 'a=1&b=2')`);
        expect(page.requests[0].url).toBe("http://localhost/x?a=1&b=2");
    });
});

describe("URLs and methods", () => {
    const button = (call, scope = "{}") => `
        <div id="d" n-scope="${scope}"><button id="b" n-on-click="${call}"></button></div>
        <div id="target">old</div>
    `;

    const send = async (call, html = "", options = {}) => {
        const page = await mount(
            `<div n-scope>${html}<button id="b" n-on-click="${call}"></button></div>`,
            { server: () => "", ...options },
        );
        page.$("#b").click();
        await page.settle();
        return page;
    };

    it("$get appends to a query string the URL already has", async () => {
        const page = await mount(button(`$get('/x?page=2', { q: 'a' })`), { server: () => "" });
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].url).toBe("http://localhost/x?page=2&q=a");
    });

    it("adds no ? when there is nothing to send", async () => {
        const page = await mount(
            `<div n-scope="{}"><button id="b" n-on-click="$get('/x')"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].url).toBe("http://localhost/x");
    });

    it("adds no & to a URL with a query when there is nothing to send", async () => {
        const page = await mount(
            `<div n-scope="{}"><button id="b" n-on-click="$get('/x?a=1')"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].url).toBe("http://localhost/x?a=1");
    });

    it("puts the query before a #fragment", async () => {
        const page = await mount(
            `<div n-scope="{}"><button id="b" n-on-click="$get('/x#top', { a: 1 })"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(new URL(page.requests[0].url).searchParams.get("a")).toBe("1");
    });

    it("adds no & to a URL that ends in ?", async () => {
        const page = await mount(
            `<div n-scope="{}"><button id="b" n-on-click="$get('/x?', { a: 1 })"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].url).toBe("http://localhost/x?a=1");
    });

    it("adds no second & to a URL that ends in &", async () => {
        const page = await mount(
            `<div n-scope="{}"><button id="b" n-on-click="$get('/x?a=1&', { b: 2 })"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].url).toBe("http://localhost/x?a=1&b=2");
    });

    it("leaves the query a URL already has as it is", async () => {
        const page = await mount(
            `<div n-scope="{}"><button id="b" n-on-click="$get('/items?expand&path=/a/b', { q: 1 })"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].url).toBe("http://localhost/items?expand&path=/a/b&q=1");
    });

    it("leaves a relative URL for the document's base to resolve", async () => {
        const page = await mount(
            `<base href="/api/">
            <div n-scope="{}"><button id="b" n-on-click="$get('items', { a: 1 })"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].url).toBe("http://localhost/api/items?a=1");
    });

    it("takes a URL object", async () => {
        const page = await send(`$get(new URL('/x?a=1', location.href), { b: 2 })`);
        expect(page.requests[0].url).toBe("http://localhost/x?a=1&b=2");
    });

    it("puts the data in the query for a lowercase get", async () => {
        const page = await mount(
            `<div n-scope="{}"><button id="b" n-on-click="$fetch('/x', 'get', { a: 1 })"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        const [request] = page.requests;
        expect(request.method).toBe("GET");
        expect(request.body).toBeUndefined();
        expect(new URL(request.url).searchParams.get("a")).toBe("1");
    });

    it("takes a request with no method as a GET", async () => {
        const page = await mount(
            `<div n-scope="{}"><button id="b" n-on-click="$fetch('/x', undefined, { a: 1 })"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].method).toBe("GET");
        expect(page.requests[0].url).toBe("http://localhost/x?a=1");
    });
});

describe("reads and writes", () => {
    const mountWrites = (answers) =>
        mount(
            `<div n-scope="{}">
                <button id="order" n-on-click="$post('/order')"></button>
                <button id="del" n-on-click="$fetch('/item', 'DELETE')"></button>
                <button id="search" n-on-click="$get('/search')"></button>
            </div>
            <div id="done">old</div><div id="results">old</div>`,
            {
                server: ({ url }) => {
                    const path = new URL(url).pathname;
                    return new Promise((resolve) => (answers[path] = resolve));
                },
            },
        );

    it("aborts the scope's read in flight when it makes another", async () => {
        const answers = [];
        const page = await mount(
            `<div n-scope="{}"><button id="b" n-on-click="$get('/x')"></button></div>
            <div id="target">old</div>`,
            { server: () => new Promise((resolve) => answers.push(resolve)) },
        );
        const signals = [];
        const fetch = page.window.fetch;
        page.window.fetch = (url, opts) => {
            signals.push(opts.signal);
            return fetch(url, opts);
        };
        page.$("#b").click();
        page.$("#b").click();
        expect(signals.map((s) => s.aborted)).toEqual([true, false]);

        answers[0](`<div id="target">first</div>`);
        answers[1](`<div id="target">second</div>`);
        await page.settle();
        expect(page.$("#target").textContent).toBe("second");
    });

    it("does not abort a write when a read starts", async () => {
        const answers = {};
        const page = await mountWrites(answers);
        page.$("#order").click();
        page.$("#search").click();
        answers["/search"](`<div id="results">found</div>`);
        await later(10);
        answers["/order"](`<div id="done">ordered</div>`);
        await page.settle();
        expect(page.$("#done").textContent).toBe("ordered");
        expect(page.$("#results").textContent).toBe("found");
    });

    it("does not abort a DELETE when a read starts", async () => {
        const answers = {};
        const page = await mountWrites(answers);
        page.$("#del").click();
        page.$("#search").click();
        answers["/search"]("");
        answers["/item"](`<div id="done">deleted</div>`);
        await page.settle();
        expect(page.$("#done").textContent).toBe("deleted");
    });

    it("aborts a read when a write starts", async () => {
        const answers = {};
        const page = await mountWrites(answers);
        page.$("#search").click();
        page.$("#order").click();
        answers["/search"](`<div id="results">stale</div>`);
        answers["/order"]("");
        await page.settle();
        expect(page.$("#results").textContent).toBe("old");
    });

    it("runs reads side by side in separate scopes", async () => {
        const signals = [];
        const page = await mount(
            `<div n-scope="{}">
                <div n-scope><button id="a" n-on-click="$get('/a')"></button></div>
                <div n-scope><button id="b" n-on-click="$get('/b')"></button></div>
            </div>`,
            { server: () => "" },
        );
        const fetch = page.window.fetch;
        page.window.fetch = (url, opts) => {
            signals.push(opts.signal);
            return fetch(url, opts);
        };
        page.$("#a").click();
        page.$("#b").click();
        expect(signals.map((s) => s.aborted)).toEqual([false, false]);
        await page.settle();
    });

    it("takes OPTIONS as a read, aborted by a newer request", async () => {
        const signals = [];
        const page = await mount(
            `<div n-scope="{}">
                <button id="o" n-on-click="$fetch('/x', 'OPTIONS')"></button>
                <button id="g" n-on-click="$get('/y')"></button>
            </div>`,
            { server: () => "" },
        );
        const fetch = page.window.fetch;
        page.window.fetch = (url, opts) => {
            signals.push(opts.signal);
            return fetch(url, opts);
        };
        page.$("#o").click();
        page.$("#g").click();
        expect(signals[0].aborted).toBe(true);
        await page.settle();
    });

    it("lets a write finish when a swap removes its scope", async () => {
        let answer;
        const page = await mount(
            `<div n-scope="{}"><button id="outer" n-on-click="$get('/outer')"></button></div>
            <div id="target" n-scope="{}"><button id="order" n-on-click="$post('/order')"></button></div>
            <div id="done">old</div>`,
            {
                server: ({ url }) =>
                    url.endsWith("/order") ? new Promise((resolve) => (answer = resolve)) : `<div id="target"></div>`,
            },
        );
        page.$("#order").click();
        page.$("#outer").click();
        await later(10);
        answer(`<div id="done">ordered</div>`);
        await page.settle();
        expect(page.$("#done").textContent).toBe("ordered");
    });

    it("drops an abortable debounce when a write starts", async () => {
        const page = await mount(
            `<div n-scope="{ got: [] }">
                <input id="i" n-on-input="$debounce(() => got = [...got, 'search'], 20, true)">
                <button id="b" n-on-click="$post('/order')"></button>
            </div>`,
            { server: () => "" },
        );
        page.$("#i").dispatchEvent(new page.window.Event("input"));
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#i").got).toEqual([]);
    });

    it("keeps the request in flight when building the next one throws", async () => {
        let answer;
        const page = await mount(
            `<div n-scope="{}">
                <button id="first" n-on-click="$get('/x')"></button>
                <div id="target">old</div>
            </div>`,
            { server: () => new Promise((resolve) => (answer = resolve)) },
        );
        const scope = page.scope("#first");
        page.$("#first").click();
        const unreadable = new Proxy({}, { ownKeys() { throw new Error("no"); } });
        expect(() => scope.$get("/y", unreadable)).toThrow("no");
        answer(`<div id="target">new</div>`);
        await page.settle();
        expect(page.$("#target").textContent).toBe("new");
    });
});

describe("dedupe", () => {
    const mountWrites = (answers) =>
        mount(
            `<div n-scope="{}">
                <button id="order" n-on-click="$post('/order')"></button>
                <button id="del" n-on-click="$fetch('/item', 'DELETE')"></button>
                <button id="search" n-on-click="$get('/search')"></button>
            </div>
            <div id="done">old</div><div id="results">old</div>`,
            {
                server: ({ url }) => {
                    const path = new URL(url).pathname;
                    return new Promise((resolve) => (answers[path] = resolve));
                },
            },
        );

    const mountWaiting = (html) => {
        const answers = [];
        return mount(html, { server: () => new Promise((resolve) => answers.push(resolve)) }).then((page) => ({ page, answers }));
    };

    it("sends no second write like the one out, and sends one after it", async () => {
        const answers = {};
        const page = await mountWrites(answers);
        page.$("#order").click();
        page.$("#order").click();
        expect(page.requests.filter((r) => r.method === "POST")).toHaveLength(1);

        answers["/order"]("");
        await page.settle();
        page.$("#order").click();
        expect(page.requests.filter((r) => r.method === "POST")).toHaveLength(2);
        answers["/order"]("");
        await page.settle();
    });

    it("sends a different write while one is out", async () => {
        const answers = {};
        const page = await mountWrites(answers);
        page.$("#order").click();
        page.$("#del").click();
        expect(page.requests.map((r) => r.method)).toEqual(["POST", "DELETE"]);
        answers["/order"]("");
        answers["/item"]("");
        await page.settle();
    });

    it("sends a write with other data while one is out", async () => {
        let answer;
        const page = await mount(
            `<div n-scope="{}">
                <button id="a" n-on-click="$post('/save', { v: 1 })"></button>
                <button id="b" n-on-click="$post('/save', { v: 2 })"></button>
            </div>`,
            { server: () => new Promise((resolve) => (answer = resolve)) },
        );
        page.$("#a").click();
        page.$("#b").click();
        expect(page.requests.map((r) => r.body)).toEqual(["v=1", "v=2"]);
    });

    it("returns nothing from $fetch, though it skips a write", async () => {
        const { page, answers } = await mountWaiting(
            `<div n-scope="{ got: [] }"><button id="b" n-on-click="got = [...got, $fetch('/x', 'POST')]"></button></div>`,
        );
        page.$("#b").click();
        page.$("#b").click();
        expect([...page.scope("#b").got]).toEqual([undefined, undefined]);
        answers.forEach((answer) => answer(""));
        await page.settle();
    });

    it("sends fetchskip from the element for a write it did not send", async () => {
        const answers = {};
        const page = await mount(
            `<div n-scope="{ _skipped: [] }" n-on-fetchskip="_skipped = [..._skipped, e.detail]">
                <button id="order" n-on-click="$post('/order')"></button>
            </div>`,
            { server: () => new Promise((resolve) => (answers.order = resolve)) },
        );
        page.$("#order").click();
        page.$("#order").click();
        expect(page.scope("#order")._skipped).toEqual([{ method: "POST", url: "/order" }]);
    });

    it("tells FormData writes with different fields apart", async () => {
        let answers = [];
        const page = await mount(
            `<div n-scope>
                <button id="a" n-on-click="const f = new FormData(); f.append('v', '1'); $post('/save', f)"></button>
                <button id="b" n-on-click="const f = new FormData(); f.append('v', '2'); $post('/save', f)"></button>
            </div>`,
            { server: () => new Promise((resolve) => answers.push(resolve)) },
        );
        page.$("#a").click();
        page.$("#b").click();
        page.$("#a").click();
        expect(page.requests.map((r) => r.body)).toEqual([[["v", "1"]], [["v", "2"]]]);
        answers.forEach((answer) => answer(""));
        await page.settle();
    });

    it("tells apart two files of the same name and size", async () => {
        const answers = [];
        const page = await mount(`<div id="d" n-scope></div>`, {
            server: () => new Promise((resolve) => answers.push(resolve)),
        });
        const scope = page.$("#d").nagiProxy;
        scope.$post("/up", { doc: new page.window.File(["1"], "photo.jpg") });
        scope.$post("/up", { doc: new page.window.File(["2"], "photo.jpg") });
        expect(page.requests).toHaveLength(2);
        answers.forEach((answer) => answer(""));
        await page.settle();
    });

    it("skips a second submit of a form with an empty file input", async () => {
        const answers = [];
        const page = await mount(
            `<form id="f" n-scope n-on-submit.prevent="$post('/save', $el)"><input name="t" value="x"><input type="file" name="doc"></form>`,
            { server: () => new Promise((resolve) => answers.push(resolve)) },
        );
        const submit = () => page.$("#f").dispatchEvent(new page.window.Event("submit", { cancelable: true }));
        submit();
        submit();
        expect(page.requests).toHaveLength(1);
        answers.forEach((answer) => answer(""));
        await page.settle();
    });

    it("sends the same write again when it is false", async () => {
        const { page, answers } = await mountWaiting(
            `<div n-scope><button id="b" n-on-click="$post('/cart/add', { id: 1 }, { dedupe: false })"></button></div>`,
        );
        page.$("#b").click();
        page.$("#b").click();
        expect(page.requests).toHaveLength(2);
        answers.forEach((answer) => answer(""));
        await page.settle();
    });

    it("takes options as the fourth argument of $fetch", async () => {
        const { page, answers } = await mountWaiting(
            `<div n-scope><button id="b" n-on-click="$fetch('/x', 'PUT', { a: 1 }, { dedupe: false })"></button></div>`,
        );
        page.$("#b").click();
        page.$("#b").click();
        expect(page.requests).toHaveLength(2);
        answers.forEach((answer) => answer(""));
        await page.settle();
    });
});

describe("timeout", () => {
    const mountWaiting = (html) => {
        const answers = [];
        return mount(html, { server: () => new Promise((resolve) => answers.push(resolve)) }).then((page) => ({ page, answers }));
    };

    it("aborts a request that takes too long, sends fetcherr, and lets the write be sent again", async () => {
        const { page, answers } = await mountWaiting(
            `<div n-scope="{ _errs: [] }" n-on-fetcherr="_errs = [..._errs, e.detail.err.name]">
                <button id="b" n-on-click="$post('/order', { a: 1 }, { timeout: 20 })"></button>
            </div>`,
        );
        page.$("#b").click();
        await later(50);
        const scope = page.scope("#b");
        expect(scope._errs).toEqual(["TimeoutError"]);
        expect(scope.$fetching).toBe(false);
        page.$("#b").click();
        expect(page.requests).toHaveLength(2);
        answers[1]("");
        await page.settle();
    });

    it("leaves a request that answers in time alone", async () => {
        const page = await mount(
            `<div n-scope="{ _err: null }" n-on-fetcherr="_err = e.detail"><button id="b" n-on-click="$get('/x', null, { timeout: 1000 })"></button></div>
            <div id="target">old</div>`,
            { server: () => `<div id="target">new</div>` },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.$("#target").textContent).toBe("new");
        expect(page.scope("#b")._err).toBeNull();
    });

    it("sets no timeout for Infinity or a negative value", async () => {
        const page = await mount(
            `<div n-scope="{ _errs: [] }" n-on-fetcherr="_errs = [..._errs, e.detail.err.name]">
                <button id="b" n-on-click="$get('/a', null, { timeout: Infinity }); $post('/b', null, { timeout: -1 })"></button>
            </div>`,
            { server: () => later(20).then(() => "") },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#b")._errs).toEqual([]);
    });
});

describe("$abort", () => {
    const mountWaiting = (html) => {
        const answers = [];
        return mount(html, { server: () => new Promise((resolve) => answers.push(resolve)) }).then((page) => ({ page, answers }));
    };

    it("aborts every request of the scope, reads and writes, with no fetcherr", async () => {
        const { page, answers } = await mountWaiting(
            `<div n-scope="{ _err: null }" n-on-fetcherr="_err = e.detail">
                <button id="r" n-on-click="$get('/read')"></button>
                <button id="w" n-on-click="$post('/write')"></button>
                <button id="stop" n-on-click="$abort()"></button>
            </div>
            <div id="target">old</div>`,
        );
        page.$("#r").click();
        page.$("#w").click();
        page.$("#stop").click();
        await later(10);
        const scope = page.scope("#r");
        expect(scope.$fetching).toBe(false);
        expect(scope._err).toBeNull();
        page.$("#w").click();
        expect(page.requests).toHaveLength(3);
        answers.forEach((answer) => answer(`<div id="target">late</div>`));
        await page.settle();
    });

    it("runs abortable debounces scheduled after $abort", async () => {
        const { page, answers } = await mountWaiting(
            `<div n-scope="{ got: 0 }">
                <button id="r" n-on-click="$get('/read')"></button>
                <button id="stop" n-on-click="$abort()"></button>
                <input id="i" n-on-input="$debounce(() => got++, 10, true)">
            </div>`,
        );
        page.$("#r").click();
        page.$("#stop").click();
        page.$("#i").dispatchEvent(new page.window.Event("input"));
        await later(40);
        expect(page.scope("#i").got).toBe(1);
        answers.forEach((answer) => answer(""));
        await page.settle();
    });

    it("drops the abortable debounces waiting when $abort is called", async () => {
        const page = await mount(`
            <div n-scope="{ got: 0 }">
                <input id="i" n-on-input="$debounce(() => got++, 10, true)">
                <button id="stop" n-on-click="$abort()"></button>
            </div>
        `);
        page.$("#i").dispatchEvent(new page.window.Event("input"));
        page.$("#stop").click();
        await later(40);
        expect(page.scope("#i").got).toBe(0);
    });

    it("runs abortable debounces scheduled after a read timed out", async () => {
        const { page, answers } = await mountWaiting(
            `<div n-scope="{ got: 0 }">
                <button id="r" n-on-click="$get('/read', null, { timeout: 10 })"></button>
                <input id="i" n-on-input="$debounce(() => got++, 10, true)">
            </div>`,
        );
        page.$("#r").click();
        await later(30);
        page.$("#i").dispatchEvent(new page.window.Event("input"));
        await later(40);
        expect(page.scope("#i").got).toBe(1);
        answers.forEach((answer) => answer(""));
        await page.settle();
    });
});

describe("$fetching", () => {
    const button = (call, scope = "{}") => `
        <div id="d" n-scope="${scope}"><button id="b" n-on-click="${call}"></button></div>
        <div id="target">old</div>
    `;

    const mountWrites = (answers) =>
        mount(
            `<div n-scope="{}">
                <button id="order" n-on-click="$post('/order')"></button>
                <button id="del" n-on-click="$fetch('/item', 'DELETE')"></button>
                <button id="search" n-on-click="$get('/search')"></button>
            </div>
            <div id="done">old</div><div id="results">old</div>`,
            {
                server: ({ url }) => {
                    const path = new URL(url).pathname;
                    return new Promise((resolve) => (answers[path] = resolve));
                },
            },
        );

    it("sets $fetching while a request is out", async () => {
        let answer;
        const page = await mount(button(`$get('/x')`), {
            server: () => new Promise((resolve) => (answer = resolve)),
        });
        page.$("#b").click();
        expect(page.scope("#b").$fetching).toBe(true);

        answer("");
        await page.settle();
        expect(page.scope("#b").$fetching).toBe(false);
    });

    it("is true while a request is out, and can be bound", async () => {
        let answer;
        const page = await mount(
            `<div n-scope>
                <button id="b" n-on-click="$get('/x')"></button>
                <span id="s" n-bind-hidden="!$fetching"></span>
            </div>`,
            { server: () => new Promise((resolve) => (answer = resolve)) },
        );
        expect(page.$("#s").hidden).toBe(true);
        page.$("#b").click();
        expect(page.$("#s").hidden).toBe(false);
        answer("");
        await page.settle();
        expect(page.$("#s").hidden).toBe(true);
    });

    it("stays fetching while any request is out", async () => {
        const answers = {};
        const page = await mountWrites(answers);
        const scope = page.scope("#order");
        page.$("#order").click();
        page.$("#search").click();
        answers["/search"]("");
        await later(10);
        expect(scope.$fetching).toBe(true);
        answers["/order"]("");
        await page.settle();
        expect(scope.$fetching).toBe(false);
    });

    it("is still fetching until what it answered is swapped in", async () => {
        const page = await mount(
            `<div n-scope="{ seen: [] }">
                <button id="b" n-on-click="$get('/x')" n-on-init="$watch(() => $fetching || seen.push(document.getElementById('target').textContent))"></button>
            </div>
            <div id="target">old</div>`,
            { server: () => `<div id="target">new</div>` },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#b").seen).toEqual(["old", "new"]);
    });
});

describe("elements outside any scope", () => {
    const mountWaiting = (html) => {
        const answers = [];
        return mount(html, { server: () => new Promise((resolve) => answers.push(resolve)) }).then((page) => ({ page, answers }));
    };

    it("each dedupe their own writes", async () => {
        const { page, answers } = await mountWaiting(`
            <button id="a" n-on-click="$post('/order')"></button>
            <button id="b" n-on-click="$post('/order')"></button>
        `);
        page.$("#a").click();
        page.$("#a").click();
        page.$("#b").click();
        expect(page.requests).toHaveLength(2);
        answers.forEach((answer) => answer(""));
        await page.settle();
    });

    it("does not let reads of elements outside any scope abort each other", async () => {
        const signals = [];
        const page = await mount(
            `<button id="a" n-on-click="$get('/a')"></button><button id="b" n-on-click="$get('/b')"></button>`,
            { server: () => "" },
        );
        const fetch = page.window.fetch;
        page.window.fetch = (url, opts) => {
            signals.push(opts.signal);
            return fetch(url, opts);
        };
        page.$("#a").click();
        page.$("#b").click();
        expect(signals.map((s) => s.aborted)).toEqual([false, false]);
        await page.settle();
    });

    it("abort an older read of the same element", async () => {
        const signals = [];
        const page = await mount(`<button id="a" n-on-click="$get('/a')"></button>`, { server: () => "" });
        const fetch = page.window.fetch;
        page.window.fetch = (url, opts) => {
            signals.push(opts.signal);
            return fetch(url, opts);
        };
        page.$("#a").click();
        page.$("#a").click();
        expect(signals.map((s) => s.aborted)).toEqual([true, false]);
        await page.settle();
    });

    it("$abort only the requests of the element that calls it", async () => {
        const { page, answers } = await mountWaiting(`
            <button id="save" n-on-click="$post('/save')"></button>
            <button id="cancel" n-on-click="$abort()"></button>
        `);
        const signals = [];
        const fetch = page.window.fetch;
        page.window.fetch = (url, opts) => {
            signals.push(opts.signal);
            return fetch(url, opts);
        };
        page.$("#save").click();
        page.$("#cancel").click();
        expect(signals.map((s) => s.aborted)).toEqual([false]);
        answers.forEach((answer) => answer(""));
        await page.settle();
    });

    it("drop an abortable debounce of the element when it makes a request", async () => {
        const page = await mount(
            `<input id="i" n-on-input="$debounce(() => $get('/late'), 20, true)" n-on-change="$post('/now')">`,
            { server: () => "" },
        );
        page.$("#i").dispatchEvent(new page.window.Event("input"));
        page.$("#i").dispatchEvent(new page.window.Event("change"));
        await later(40);
        await page.settle();
        expect(page.requests.map((r) => r.url)).toEqual(["http://localhost/now"]);
    });

    it("send the events of a request made after an await to their element", async () => {
        const page = await mount(
            `<div n-scope="{ got: 0 }"><span id="s" n-bind-textcontent="got"></span></div>
            <button id="b" n-on-click="await 0; $post('/x')" n-on-fetcherr="document.querySelector('[n-scope]').nagiProxy.got++"></button>`,
            { server: () => ({ status: 500 }) },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.$("#s").textContent).toBe("1");
    });

    it("bind $fetching for their own requests", async () => {
        const { page, answers } = await mountWaiting(`<button id="b" n-on-click="$post('/x')" n-bind-disabled="$fetching"></button>`);
        page.$("#b").click();
        expect(page.$("#b").disabled).toBe(true);
        answers.forEach((answer) => answer(""));
        await page.settle();
        expect(page.$("#b").disabled).toBe(false);
    });
});

describe("options", () => {
    it("takes null options as none", async () => {
        const page = await mount(
            `<div n-scope><button id="b" n-on-click="$post('/x', { a: 1 }, null)"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.requests).toHaveLength(1);
        expect(page.errors).toEqual([]);
    });
});

describe("tracking", () => {
    it("does not rerun a watcher that read the abort signal when it makes a request", async () => {
        const page = await mount(
            `<div n-scope="{ q: 'a' }">
                <span n-on-init="$watch(() => { q; $debounce(() => 0, 10); $get('/s') })"></span>
            </div>`,
            { server: () => "" },
        );
        await page.settle();
        expect(page.requests).toHaveLength(1);
        expect(page.errors).toEqual([]);
    });

    it("does not rerun a watcher that debounces a request when the request is made", async () => {
        const page = await mount(
            `<div n-scope="{ q: 'a' }">
                <span n-on-init="$watch(() => { q; $debounce(() => $get('/s'), 10) })"></span>
            </div>`,
            { server: () => "" },
        );
        await page.settle();
        await later(50);
        await page.settle();
        expect(page.requests).toHaveLength(1);
    });

    it("does not track what a request reads into the watcher that made it", async () => {
        const page = await mount(
            `<div n-scope="{ q: 'a' }">
                <span n-on-init="$watch(() => $get('/s', { q }))"></span>
            </div>`,
            { server: () => "" },
        );
        await page.settle();
        await later(30);
        await page.settle();
        expect(page.requests).toHaveLength(1);
    });
});

describe("after an await", () => {
    it("sends fetcherr from the scope's element for a request made after an await", async () => {
        const page = await mount(
            `<div id="d" n-scope="{ _err: null }" n-on-fetcherr="_err = e.detail.err">
                <button id="b" n-on-click="await 0; $get('/x')"></button>
            </div>`,
            { server: () => ({ status: 500, body: "no" }) },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.$("#d").nagiProxy._err).not.toBeNull();
    });
});
