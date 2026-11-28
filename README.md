<p align="center">
  <img src="./assets/logo.svg" alt="" width="120">
</p>

# Nagi (凪)

Nagi is a small library for reactive HTML and partial page updates. It is a fork of [Nomini](https://github.com/nonnorm/nomini) by nonnorm, reworked so that every binding is an attribute of its own and easy to write from a template engine.

Nagi lets you:
- Add lightweight reactive state directly in your HTML
- Bind DOM properties and classes with automatic dependency tracking
- Listen to any event with inline handlers
- Make requests and swap their responses into any part of the page
- Keep everything declarative and local

## Why Nagi?
- Values are plain JavaScript, and the only syntax to learn is a handful of attribute names
- One attribute per binding, so templates can add, leave out or pass along each one
- Event handlers with modifiers and access to reactive variables
- Requests send exactly what you give them

## What Nagi is *not*
Nagi is deliberately minimal. It **does not** try to be:
- A template language
- A performant virtual DOM
- A full-featured set of helpers for every use case
- A global state management system

Nagi stays small by keeping the mental model simple: **Boring HTML + islands of reactivity + server-driven pages**

## Usage

Copy `dist/nagi.min.js` into your project and load it with a normal or `defer` script tag (not `async`).

```html
<script defer src="/js/nagi.min.js"></script>
```

```html
<div n-scope="{ count: 0 }">
  <button n-on-click="count++">+1</button>
  <span n-bind-textcontent="count"></span>
</div>
```

The values of `n-let-*`, `n-bind-*` and `n-on-*` are plain JavaScript. In them, the names of the scope are variables, `this` is the scope, and `$el` is the element.

### Attributes

#### `n-scope`
Makes a reactive scope from an object. Elements inside it can read and write its names, and bindings update when a name they read changes.

```html
<div n-scope="{ first: 'Ada', last: 'Lovelace', full() { return `${this.first} ${this.last}` } }">
  <p n-bind-textcontent="full()"></p>
</div>
```

- The value can be any expression that gives an object, such as `n-scope="makeCart($el)"`. Write methods with method syntax (`inc() { this.n++ }`), not arrow functions.
- Like `n-let-*`, the value can read the names of outer scopes, once, but not Nagi's `$` names other than `$el`. Methods in the object still reach the scope through `this`.
- `n-scope` with no value makes an empty scope. If the value fails, or gives a promise, a built-in object such as a `Map`, or no object at all, Nagi logs an error and leaves the element, its attributes and what is inside it alone, as with `n-ignore`. To set it up once fixed, call `nagi.destroy` and then `nagi.init` on it.
- Scopes nest. Inner elements can use the names of outer scopes too.

#### `n-let-<name>`
Adds one name to the scope from an expression, which can use the names of outer scopes. Write it on the element of `n-scope`; elsewhere Nagi logs an error and ignores it. Elements inside the scope read and write the name as any other.

```html
<div n-scope n-let-open="false" n-let-toggle="() => open = !open">
  <button n-on-click="toggle()">Menu</button>
  <nav n-bind-hidden="!open">…</nav>
</div>
```

- It sets a key of the same name in the `n-scope` object.
- Names starting with `$` or `_nagi`, and `__host`, are reserved for Nagi.

#### `n-bind-<property>`
Sets a property of the element to an expression, and keeps it up to date. `n-bind-textcontent` sets `textContent`, and so on. A promise sets the property when it resolves. `undefined` writes an empty text to a text property such as `value`, `href` or `title`, so a value not there yet shows nothing; `null` is written as it is, which removes an `aria*` attribute.

```html
<input n-bind-value="query" n-bind-disabled="$fetching">
```

| Attribute | Effect |
|---|---|
| `n-bind-class="…"` | Adds the classes of a string, an array, or an object's keys whose values are truthy. Classes written in the HTML stay |
| `n-bind-class.<name>="…"` | Toggles one class |
| `n-bind-style.<css-name>="…"` | Sets one style, `--custom` properties included. `null` or `false` removes it |
| `n-bind-dataset.<name>="…"` | Sets `data-<name>`. `null` or `false` removes it |

```html
<li n-bind-class="{ done: item.done, active: item.id === current }"
    n-bind-style.--progress="item.progress + '%'"></li>
```

#### `n-on-<event>`
Runs statements when the event fires. The event is `e`, and the handler can `await`. Any event works, custom ones included, as long as its name is lowercase.

```html
<button n-on-click="count++; $dispatch('changed', { count })">+1</button>
```

| Modifier | Effect |
|---|---|
| `.prevent` | Calls `e.preventDefault()` |
| `.stop` | Calls `e.stopPropagation()` |
| `.once` | Runs only the first time |
| `.window` | Listens on `window` |
| `.debounce<ms>` | Waits until the events stop for `<ms>`, then runs once |

```html
<form n-on-submit.prevent="$post('/save', e)">…</form>
<input n-on-input.debounce300="$get('/search', { q: $el.value })">
```

#### `n-ref`
Puts the element in its scope's `$refs` under the given name.

```html
<div n-scope>
  <button n-on-click="$refs.dialog.showModal()">Open</button>
  <dialog n-ref="dialog">…</dialog>
</div>
```

- Inner scopes find the refs of outer scopes too, the nearer scope first.
- An element with `n-scope` goes into the `$refs` of the scope around it.
- Binds that read `$refs` update as refs come and go. When elements share a name, the last one in the page wins, and the next to last takes its place when it goes.

#### `n-form`
Copies the value of each named field inside it into the scope, as the user changes it.

```html
<form n-scope n-form n-on-submit.prevent="$post('/signup', e)">
  <input name="email" type="email">
  <button n-bind-disabled="$fetching">Sign up</button>
  <p n-bind-hidden="!email">We will write to <span n-bind-textcontent="email"></span>.</p>
</form>
```

- Reads `input`, `select` and `textarea`. A checkbox gives `true` or `false`, checkboxes that share a name the list of the checked values (give each its own `value`; adding or taking away the second one changes the kind of value, so a pair that comes in two fragments of one response reads `true` or `false` until the second; disabled boxes count, though a form does not send them), a radio group the checked value, a number field a number (`undefined` when empty), a file field its `FileList`, a multiple select a list, and other fields a string.
- Values flow from the fields to the scope. Write the first value in the field's HTML. A field whose value a bind sets, such as with `n-bind-value`, `n-bind-checked` or `n-bind-selected` on an option, is read again after each write, so its name follows, as in `<input name="slug" n-bind-value="slugify(title)">`. Assigning the name itself does not change the field. Binds do not set the value of the field that has focus (for radios, its group), so a field being typed in is not written over; a value held back that way is set when the field loses focus. Two fields whose binds compute each other, such as a unit converter, feed rounding back into the scope; write those with `n-on-input` instead.
- The form owns the names of its fields. Don't also define them in `n-scope` or `n-let-*`, and give each field a name of its own within the scope, even across two forms in it; only radios of one group in one form, or checkboxes in one form and one `n-form` element, share a name. Nagi logs an error otherwise.
- When a swap takes the last field of a name out of its scope, its name becomes `undefined` once the whole response is in, unless a field anywhere in the response took it over or something has written the name since; init handlers of the response still see the old value. A field taken away with `nagi.destroy` after it is removed, or in the same task, is checked the same way at the end of the task. A radio or checkbox group reads the fields that remain, so a checkbox group left with one box reads `true` or `false` again.
- A name like `first-name` is not a valid variable name; read it as `this['first-name']`, or use names like `firstName`.
- For custom elements, use `n-on-*`, as in `n-on-input="this.date = $el.value"`.

#### `n-ignore`
Nagi leaves the element and everything inside it alone.

### `data-*` attributes

Use `data-*` for constant values the server writes into the HTML. They are not names in the scope; read them with:

- `$el.dataset.<name>`: the element's own
- `$dataset()`: the element's and all its ancestors', the nearer ones winning

```html
<body data-csrf="…">
  <ul n-scope data-list="7">
    <li data-item="42">
      <button n-on-click="const { list, item, csrf } = $dataset(); $post('/move', { list, item, csrf })">Move</button>
    </li>
  </ul>
</body>
```

Pick the values a request needs from `$dataset()` rather than sending all of it.

### Helpers

| Helper | Description |
|---|---|
| `$get(url, data, options)` | Sends a GET request. `$post`, `$put`, `$patch` and `$delete` send the other methods |
| `$fetch(url, method, data, options)` | Sends a request with any method |
| `$abort()` | Aborts the scope's requests |
| `$fetching` | `true` while the scope has a request in flight |
| `$refs` | The elements named by `n-ref`, in this scope and outer ones |
| `$dataset()` | The `data-*` of the element and its ancestors |
| `$dispatch(name, detail, options)` | Dispatches a bubbling event from the element |
| `$watch(fn)` | Runs `fn`, and again whenever what it read changes (before its first `await`; see Things to know) |
| `$debounce(fn, ms, { key })` | Runs `fn` once calls have stopped for `ms`. Calls count as one when they come from the same attribute, `$watch` or, for `.debounce<ms>` and `this.$debounce`, handler, and pass a function with the same code; native functions, such as bound ones, count as the same code. To choose which calls count as one, pass a `key`, which counts for the calls from the same element. Pass one for two bound functions or closures in a loop at one place, for `this.$debounce` after an `await`, and to each `$debounce` in the `$watch`es that a `$watch` or `n-bind-*` makes when any of those watches is made only under some condition, since they are told apart by their order. `{ abortable: true }` drops a run still waiting when the scope starts a request |
| `$persist(name, key)` | Keeps a name of the scope in `localStorage` as JSON. Call it from `n-on-init`. When the value gives no JSON, as `undefined` and functions do, or cannot be saved, the stored value is removed and the next page starts from the scope's own value. The key is `_nagiProp-<name>` unless given, the same on every page of the origin |

### Requests

A request sends only the data you pass:

- an object (arrays repeat the key; files are sent as `FormData`; a `Date` goes as its ISO text; functions are left out, and so, with a warning, is anything that does not turn into text, such as a nested object). Passing the scope, as `this`, sends the names defined on that scope itself (not those of outer scopes or prototypes, nor Nagi's); a getter that throws is left out with a warning
- a form, an element inside one, or a submit event, to send the form's fields
- `FormData`, `URLSearchParams` or a query string

GET, HEAD and DELETE put the data in the query string; other methods send it as the body. Every request has an `n-request: true` header, and the helpers return nothing: the response updates the page.

```html
<button n-on-click="$delete(`/items/${id}`)">Delete</button>
<button n-on-click="$get('/items', { page: $el.dataset.page })" data-page="2">More</button>
```

`options` can hold `timeout` (milliseconds) and `dedupe: false`.

- **Reads:** a scope runs one GET at a time. A new request aborts the GET in flight, so the newest wins. Put reads that should run side by side in separate scopes.
- **Writes:** POST and the other writes are never cut off. The same write is not sent again while one is in flight.

### Responses

The response is HTML. Each top-level element with an `id` updates the element with the same `id` on the page, as `n-swap` on the response's element says:

| `n-swap` | Effect |
|---|---|
| `outer` (default) | Replaces the element |
| `inner` | Replaces its children |
| `before` / `after` | Inserts the response's children before or after it |
| `prepend` / `append` | Inserts them at the start or end of it |

For example, the server responds with:

```html
<div id="cart-count">3</div>
<ul id="items" n-swap="append">
  <li>New item</li>
</ul>
```

What comes in works like the rest of the page, and CSS transitions run on elements that keep their `id`. An error response is used only if it has elements with `id`s on the page.

| Response header | Effect |
|---|---|
| `n-redirect: <url>` | Goes to the URL instead (send it with a 2xx status) |
| `n-replace-url: <url>` | Replaces the URL in the address bar |

Requests are sent with `fetch`, which follows HTTP redirects by itself. Nagi sees only the final response and handles it like any other, with that response's own headers. A redirect to another origin usually fails, because the `n-request` header needs CORS there. To leave the page, answer with `n-redirect` (with a 2xx status) rather than a redirect. In particular, answer a Nagi request that needs a login with `n-redirect` or with HTML to swap in, not with a redirect to the login page, whose elements with `id`s on the current page would replace them.

### Events

| Event | When |
|---|---|
| `init` | An element with `n-bind-*` or `n-on-*` is set up. It fires once everything set up with it (on load, by one fragment of a response, or by `nagi.init`) is bound, in the order Nagi found the elements, so a handler can reach the elements inside. Elements it adds need `nagi.init`, and elements inside whose `n-*` attributes it changes need `nagi.destroy` and then `nagi.init` |
| `destroy` | Such an element is about to be removed by a swap, or is passed to `nagi.destroy` |
| `fetcherr` | A request fails or times out, or its response is not 2xx. `e.detail` has `status`, `text` and `err` |
| `fetchskip` | A write is skipped because the same one is in flight |
| `fetchredirect` | Nagi is about to follow `n-redirect`. Cancel it to stay |
| `fetchdone` | A request got a 2xx response, after any HTML in it is swapped in and the request is no longer counted in `$fetching`. `e.detail` has `url` (the one requested), `status` and `swapped` (whether any element was swapped). Not sent for `n-redirect`. If the response replaced the element that sent the request, catch it with `.window` |

The `fetch*` events bubble. Listen with `.window` to catch them all:

```html
<body n-on-fetcherr.window="alert(`Failed: ${e.detail.status ?? e.detail.err}`)">
```

### Changing the page from scripts

Nagi sets up the page when it loads, and what responses bring in. When another script adds or removes elements, tell Nagi with the global `nagi`:

| Function | Description |
|---|---|
| `nagi.init(el)` | Sets up `el` and what is inside it that is not set up yet, in the scopes around it. Call it on the outermost element added, and only after it is in the page. Calling it again does nothing more |
| `nagi.destroy(el)` | Tears down `el` and what is inside it as a swap would: sends `destroy`, stops its binds, listeners, timers and reads. Call it before or after removing `el` |

```js
nagi.destroy(row);
row.remove();
```

### Things to know

- HTML lowercases attribute names, so `n-let-isOpen` defines `isopen`.
- Changes are tracked when a name is assigned: write `items = [...items, x]`, not `items.push(x)`, and `user = { ...user, name }`, not `user.name = name`.
- Declare the names you assign in a scope. Assigning an undeclared name makes a global variable.
- An async `n-bind-*` or `$watch` follows only the names it reads before its first `await`. In the async function it calls, read the names first, as in `const { id, lang } = this; const data = await load(id)`. Make no `$watch` or `$persist` after an `await` in either, since each run would add another. Only the value an `n-bind-*` returns is dropped when a newer run has overtaken it, so return results that arrive late from an `n-bind-*` rather than assigning them from an async `$watch`. An async `n-bind-*` or `$watch` that, after an `await`, writes a name it read before its first `await` runs again each time the value written differs, which for fetched data is every time; do that write in the `n-on-*` handler of the event that changes what it depends on.
- Helpers named bare in `n-on-*` and `n-bind-*` (`$dispatch`, not `this.$dispatch`) act from their element, even after an `await` and even if the element has left the page by then; what it dispatches then reaches only what left with it. Once the element has been torn down (by a swap or `nagi.destroy`), `$watch`, `$persist` and `$debounce` called from its handlers start nothing, and its requests are still sent but not tied to it. A request whose element is torn down, or set up again, before it finishes sends its `fetch*` events to `document`. Called through `this`, as in a method of the scope, helpers act from that element only until the first `await`, and from the scope's element after it, so a method that a torn-down element's handler calls after an `await` still starts its work on the scope.
- Nagi sets up the page when it loads, and what responses bring in. Elements other scripts add or remove need `nagi.init` and `nagi.destroy`.

## Development

Tools are managed with [mise](https://mise.jdx.dev).

```sh
mise install
npm install
mise run test
mise run build  # writes dist/nagi.min.js
```

## License

MIT. Nagi keeps the copyright of Nomini, its origin; see [LICENSE](./LICENSE).
