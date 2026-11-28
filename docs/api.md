# Nagi API

Every attribute, helper, event and option of Nagi, with the rules to know. For a first look, see [Getting Started](../README.md#getting-started).

## Contents

1. [Expressions](#expressions)
2. [Attributes](#attributes): [`n-scope`](#n-scope), [`n-let-<name>`](#n-let-name), [`n-bind-<property>`](#n-bind-property), [classes, styles and `data-*`](#classes-styles-and-data-), [`n-on-<event>`](#n-on-event), [`n-ref`](#n-ref), [`n-form`](#n-form), [`n-ignore`](#n-ignore)
3. [`data-*` attributes](#data--attributes)
4. [Helpers](#helpers)
5. [Requests](#requests)
6. [Responses](#responses)
7. [Events](#events)
8. [Changing the page from scripts](#changing-the-page-from-scripts)

## Expressions

The values of `n-scope`, `n-let-*`, `n-bind-*` and `n-on-*` are plain JavaScript. In them:

- the names of the scope, and of the scopes around it, are variables;
- `this` is the scope;
- `$el` is the element;
- in `n-on-*`, `e` is the event.

Rules that apply to all of them:

- HTML lowercases attribute names, so `n-let-isOpen` defines `isopen`.
- Declare the names you assign, in `n-scope` or `n-let-*`. Assigning an undeclared name makes a global variable.
- Changes are tracked when a name is assigned: write `items = [...items, x]`, not `items.push(x)`, and `user = { ...user, name }`, not `user.name = name`.
- An assignment takes effect at once: every binding that reads the name runs again before the next statement. Code right after it sees the page updated, so `open = true; $refs.input.focus()` works. It also means that after `first = 'Grace'; last = 'Hopper'`, a binding that reads both runs twice, the first time with the new first name and the old last name. The page is drawn only after the handler, so the in-between state is not seen, but an expression that needs the two to agree, such as `items[index].name` after `items = newItems; index = 0`, can throw, and a `$watch` that sends a request sends one more. Assign related values as one object (`filter = { page: 1, q }`) or in an order where each step is consistent, and start requests from the handler after the assignments rather than from a `$watch`.
- A binding or `$watch` that assigns a name it reads sets itself off again. When one runs 100 times in a row, Nagi stops it and logs an error that names the element, the attribute, and the name that kept changing. The stopped binding does not run again until its element is set up again. Treat the error as a bug to fix: assign in a handler instead, or compute the value without assigning what the binding reads.

**Security.** Nagi runs the values as code with `new Function`:

- A Content-Security-Policy that limits `script-src` must allow `'unsafe-eval'`, or Nagi does not run.
- Never write user input into an `n-*` attribute on the server: it runs as code, which is an XSS hole. Put such values in the element's text, a `data-*` attribute, or a normal attribute, escaped as usual, and read them from there.

## Attributes

### `n-scope`

Makes a reactive scope from an object. Elements inside it can read and write its names, and bindings update when a name they read changes.

```html
<div n-scope="{ first: 'Ada', last: 'Lovelace', full() { return `${this.first} ${this.last}` } }">
  <p n-bind-textcontent="full()"></p>
</div>
```

- The value can be any expression that gives an object, such as `n-scope="makeCart($el)"`. Write methods with method syntax (`inc() { this.n++ }`), not arrow functions, and reach the scope through `this`.
- The scope is a copy of the object: its own properties, getters and setters included, on the same prototype. Code that keeps a reference to the original object changes the original, not the scope, so a method written as `inc() { state.n++ }` updates nothing; write `this.n++`. Objects that use `#private` fields do not work, since the copy has none.
- Like `n-let-*`, the value can read the names of outer scopes, once when the scope is made, but not Nagi's `$` names other than `$el`.
- `n-scope` with no value makes an empty scope. If the value throws, or gives a promise, a built-in object such as a `Map`, or no object at all, Nagi logs an error and leaves the element, its attributes and what is inside it alone, as with `n-ignore`. To set it up once fixed, call `nagi.destroy` and then `nagi.init` on it.
- Scopes nest. Inner elements can use the names of outer scopes too, and assigning such a name changes it in the scope that has it.

### `n-let-<name>`

Adds one name to the scope from an expression, which can use the names of outer scopes. Elements inside the scope read and write the name as any other.

```html
<div n-scope n-let-open="false" n-let-toggle="() => open = !open">
  <button n-on-click="toggle()">Menu</button>
  <nav n-bind-hidden="!open">…</nav>
</div>
```

- Write it on the element of `n-scope`; elsewhere Nagi logs an error and ignores it.
- It sets a key of the same name in the `n-scope` object.
- Names starting with `$` or `_nagi`, and `__host`, are reserved for Nagi.

### `n-bind-<property>`

Sets a property of the element to an expression, and keeps it up to date.

```html
<input n-bind-value="query" n-bind-disabled="$fetching">
```

- The name is the DOM property, all lowercase: `n-bind-textcontent` sets `textContent`, `n-bind-htmlfor` sets `htmlFor` (the `for` attribute), and `n-bind-arialabel` sets `ariaLabel` (`aria-label`). Nagi logs an error for a property the element does not have, or cannot write.
- `undefined` writes an empty text to a property that holds text when it is bound, such as `value`, `title` or `href`, so a value not there yet is not shown as the word "undefined". An empty `href` still links to the page itself.
- `null`, and every other value, is written as it is. `undefined` is written as it is to properties that hold no text when bound, and to `aria*`, `role`, `popover` and `crossOrigin`, where `undefined` and `null` remove the attribute. `outerHTML` and `outerText` replace the element whatever is written, `undefined` included, which becomes the text "undefined".
- A promise sets the property when it resolves. When the binding runs again before it resolves, the older result is dropped.
- HTML put in with `n-bind-innerhtml` is not set up: its `n-*` attributes do nothing. Bring HTML from the server in with a [response](#responses) instead.

An async binding (one that gives a promise, such as `load(id)` with an async `load`) follows only the names it reads before its first `await`. In the async function it calls, read the names first, as in `const { id, lang } = this; const data = await load(id)`. An async binding that, after an `await`, writes a name it read before the `await` runs again each time the value written differs, which for fetched data is every time; do that write in the `n-on-*` handler of the event that changes what it depends on.

Attributes with no property, such as most SVG attributes (`d`, `viewBox`, `href` of `<use>`), cannot be bound. Set them from a `$watch` made in `n-on-init`, which stops when the element is torn down:

```html
<svg><use n-on-init="$watch(() => $el.setAttribute('href', open ? '#icon-open' : '#icon-closed'))"></use></svg>
```

### Classes, styles and `data-*`

| Attribute | Effect |
|---|---|
| `n-bind-class="…"` | Adds the classes of a string, an array, or an object's keys whose values are truthy, and takes off the ones it added that are no longer there. Classes written in the HTML stay |
| `n-bind-class.<name>="…"` | Toggles one class |
| `n-bind-style.<css-name>="…"` | Sets one style, `--custom` properties included. `null` or `false` removes it |
| `n-bind-dataset.<name>="…"` | Sets `data-<name>`. `null` or `false` removes it |

```html
<li n-bind-class="{ done: item.done, active: item.id === current }"
    n-bind-style.--progress="item.progress + '%'"></li>
```

### `n-on-<event>`

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

- The value is statements, not a function: `n-on-click="() => save()"` only makes a function, and Nagi warns about it. Write `n-on-click="save()"`.
- After `.debounce<ms>` waits, or after an `await`, the event has already been delivered: `e.preventDefault()` and `e.stopPropagation()` have no effect, and `e.currentTarget` is `null`. Use `.prevent` and `.stop`, which act before the wait, and `$el` for the element.
- Nagi warns about modifiers it does not know.

### `n-ref`

Puts the element in its scope's `$refs` under the given name.

```html
<div n-scope>
  <button n-on-click="$refs.dialog.showModal()">Open</button>
  <dialog n-ref="dialog">…</dialog>
</div>
```

- Inner scopes find the refs of outer scopes too, the nearer scope first.
- An element with `n-scope` goes into the `$refs` of the scope around it.
- Bindings that read `$refs` update as refs come and go. When elements share a name, the last one in the page wins, and the next to last takes its place when it goes.

### `n-form`

Copies the value of each named field inside it into the scope, as the user changes it.

```html
<form n-scope n-form n-on-submit.prevent="$post('/signup', e)">
  <input name="email" type="email">
  <button n-bind-disabled="$fetching">Sign up</button>
  <p n-bind-hidden="!email">We will write to <span n-bind-textcontent="email"></span>.</p>
</form>
```

What each field gives:

| Field | Value |
|---|---|
| Checkbox | `true` or `false` |
| Checkboxes sharing a name | The list of the checked values |
| Radio group | The checked value |
| Number field | A number, `undefined` when empty |
| File field | Its `FileList` |
| Multiple select | A list |
| Other `input`, `select` and `textarea` | A string |

- Give each checkbox of a group its own `value`. Disabled boxes count, though a form does not send them. A group becomes a list once it has a second box, so a pair that comes in two fragments of one response reads `true` or `false` until the second, and a group left with one box reads `true` or `false` again.
- Values flow from the fields to the scope. Write the first value in the field's HTML. Assigning the name does not change the field.
- A field whose value a binding sets, such as with `n-bind-value`, `n-bind-checked` or `n-bind-selected` on an option, is read again after each write, so its name follows, as in `<input name="slug" n-bind-value="slugify(title)">`. Bindings do not set the value of the field that has focus (for radios, its group), so a field being typed in is not written over; a value held back that way is set when the field loses focus. Two fields whose bindings compute each other, such as a unit converter, feed rounding back into the scope; write those with `n-on-input` instead.
- The form owns the names of its fields. Don't also define them in `n-scope` or `n-let-*`, and give each field a name of its own within the scope, even across two forms in it; only radios of one group in one form, or checkboxes in one form and one `n-form` element, share a name. Nagi logs an error otherwise.
- When a swap takes the last field of a name out of its scope, its name becomes `undefined` once the whole response is in, unless a field anywhere in the response took it over or something has written the name since; init handlers of the response still see the old value. A field taken away with `nagi.destroy` after it is removed, or in the same task, is checked the same way at the end of the task.
- Resetting the form sets each name in turn, so a `$watch` that reads several of them runs once for each.
- A name like `first-name` is not a valid variable name; read it as `this['first-name']`, or use names like `firstName`.
- For custom elements, use `n-on-*`, as in `n-on-input="this.date = $el.value"`.

### `n-ignore`

Nagi leaves the element and everything inside it alone.

## `data-*` attributes

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

## Helpers

Every scope has these names. They are not sent with the scope and cannot be redefined.

| Helper | Description |
|---|---|
| `$get(url, data, options)` | Sends a GET request. `$post`, `$put`, `$patch` and `$delete` send the other methods. See [Requests](#requests) |
| `$fetch(url, method, data, options)` | Sends a request with any method |
| `$abort()` | Aborts every request of the scope, writes included, and drops the abortable debounces waiting in it |
| `$fetching` | `true` while the scope has a request in flight |
| `$refs` | The elements named by `n-ref`, in this scope and outer ones |
| `$dataset()` | The `data-*` of the element and its ancestors |
| `$dispatch(name, detail, options)` | Dispatches a bubbling event from the element. `options` are those of `CustomEvent` |
| `$watch(fn)` | Runs `fn`, and again whenever a name it read changes |
| `$debounce(fn, ms, options)` | Runs `fn` once calls have stopped for `ms` |
| `$persist(name, key)` | Keeps a name of the scope in `localStorage` |

**`$watch(fn)`.** The watch belongs to the element it is made from and stops when that element is torn down. An async `fn` follows only the names it reads before its first `await`, as an async binding does. Make no `$watch` or `$persist` after an `await` in a binding or `$watch`, since each run would add another. Only the value a binding returns is dropped when a newer run has overtaken it, so return results that arrive late from an `n-bind-*` rather than assigning them from an async `$watch`. A rejected `fn` is logged.

**`$debounce(fn, ms, { key, abortable })`.** Calls count as one, so only the last runs, when they come from the same place and pass a function with the same code:

- The same place is the same attribute or `$watch`, or, for `.debounce<ms>` and `this.$debounce`, the same handler.
- Native functions, such as bound ones, count as the same code.
- To choose which calls count as one, pass a `key`; calls from the same element with the same key count as one. Pass one for two bound functions, or closures in a loop, at one place; for `this.$debounce` after an `await`; and to each `$debounce` in the `$watch`es that a `$watch` or `n-bind-*` makes when any of those watches is made only under some condition, since they are told apart by their order.
- `abortable: true` drops a run still waiting when the scope starts a request.

**`$persist(name, key)`.** Saves the name as JSON whenever it changes, and restores it when the page loads. Call it from `n-on-init`. When the value gives no JSON, as `undefined` and functions do, or cannot be saved, the stored value is removed and the next page starts from the scope's own value. The key is `_nagiProp-<name>` unless given, the same on every page of the origin.

**Where helpers act from.** Helpers named bare in `n-on-*` and `n-bind-*` (`$dispatch`, not `this.$dispatch`) act from their element, even after an `await` and even if the element has left the page by then; what it dispatches then reaches only what left with it. Called through `this`, as in a method of the scope, helpers act from that element only until the first `await`, and from the scope's element after it.

Once an element has been torn down (by a swap or `nagi.destroy`), `$watch`, `$persist` and `$debounce` called from its handlers start nothing, and its requests are still sent but not tied to it. A method that a torn-down element's handler calls after an `await` acts from the scope's element, so it still starts its work.

## Requests

A request sends only the data you pass:

- **An object.** Arrays repeat the key, files are sent as `FormData`, and a `Date` goes as its ISO text. Functions are left out, and so, with a warning, is anything that does not turn into text, such as a nested object, and a value that throws when read, such as a getter that throws.
- **The scope, as `this`.** It is sent as an object of the names defined on that scope itself: its own enumerable names, not those of outer scopes or prototypes, nor Nagi's.
- **A form, an element inside one, or a submit event**, to send the form's fields.
- **`FormData`, `URLSearchParams` or a query string.**

```html
<button n-on-click="$delete(`/items/${id}`)">Delete</button>
<button n-on-click="$get('/items', { page: $el.dataset.page })" data-page="2">More</button>
```

- GET, HEAD and DELETE put the data in the query string, without files (Nagi warns); other methods send it as the body.
- Every request has an `n-request: true` header. Nagi sends no other header and no JSON body: it is made for a server of your own that answers with HTML. Send a CSRF token in the body, as with `$dataset()` above.
- The helpers return nothing: the response updates the page, and [events](#events) tell how it went.

`options` can hold:

| Option | Effect |
|---|---|
| `timeout` | Aborts the request after this many milliseconds, with a `fetcherr` |
| `dedupe: false` | Sends a write even when the same one is in flight |

How a scope's requests go together:

- **Any request stops the scope's read.** A scope runs one GET at a time. A new request of the scope, a write such as POST included, aborts the GET in flight and drops the abortable debounces waiting in the scope. Put reads and writes that have nothing to do with each other, or reads that should run side by side, in separate scopes.
- **Writes are never cut off** by other requests. The same write (method, URL and data) is not sent again while one is in flight; a `fetchskip` event fires instead.

## Responses

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

- What comes in is set up like the rest of the page, and what it replaces is torn down.
- A top-level element with no `id`, or with an `id` that is not on the page, is skipped with a warning, and so is an unknown `n-swap`.
- `<script>` elements in the response do not run. Write behaviour with `n-on-init` and the other attributes.
- A swap builds what it replaces anew, so a field inside loses its focus, its cursor and its scroll position. Don't swap a region that holds the field being typed in, such as a search box that searches as you type: answer with the results only.
- An error response (not 2xx) is used only if it has top-level elements whose `id`s are on the page.

**Transitions.** When an `outer` or `inner` swap replaces an element with a new one of the same `id` and tag, the new one first shows the old one's `class`, `style`, `height` and `width`, and takes its own in the next frame, so CSS transitions run. `before`, `after`, `prepend` and `append` replace nothing, so their elements do not transition. Changes made to the new element before that frame are kept:

- A class or style property another script changes stays as it set it, and so do `height` and `width`.
- The class becomes the element's own classes plus what its `n-bind-class` bindings hold at that frame, so a binding that changes in between is followed.

| Response header | Effect |
|---|---|
| `n-redirect: <url>` | Goes to the URL instead (send it with a 2xx status) |
| `n-replace-url: <url>` | Replaces the URL in the address bar |

Requests are sent with `fetch`, which follows HTTP redirects by itself. Nagi sees only the final response and handles it like any other, with that response's own headers. A redirect to another origin usually fails, because the `n-request` header needs CORS there. To leave the page, answer with `n-redirect` (with a 2xx status) rather than a redirect. In particular, answer a Nagi request that needs a login with `n-redirect` or with HTML to swap in, not with a redirect to the login page, whose elements with `id`s on the current page would replace them.

## Events

| Event | When |
|---|---|
| `init` | An element with `n-bind-*` or `n-on-*` is set up. It fires once everything set up with it (on load, by one fragment of a response, or by `nagi.init`) is bound, in the order Nagi found the elements, so a handler can reach the elements inside |
| `destroy` | An element that got `init` is about to be removed by a swap, or is passed to `nagi.destroy`. An element torn down before its `init` fired gets no `destroy` |
| `fetcherr` | A request fails or times out, or its response is not 2xx. `e.detail` has `url`, `status`, `text`, `err` and `swapped` |
| `fetchskip` | A write is skipped because the same one is in flight. `e.detail` has `method` and `url` |
| `fetchredirect` | Nagi is about to follow `n-redirect`. `e.detail` has `url`. Cancel it with `e.preventDefault()` to stay |
| `fetchdone` | A request got a 2xx response, after any HTML in it is swapped in and the request is no longer counted in `$fetching`. `e.detail` has `url` (the one requested), `status` and `swapped` (whether any element was swapped). Not sent for `n-redirect` |

- `init` and `destroy` do not bubble.
- Elements an `init` handler adds need `nagi.init`, and elements inside whose `n-*` attributes it changes need `nagi.destroy` and then `nagi.init`.
- The `fetch*` events are sent to the element that made the request, and bubble. Listen with `.window` to catch them all:

```html
<body n-on-fetcherr.window="alert(`Failed: ${e.detail.status ?? e.detail.err}`)">
```

- A request whose element is torn down before it finishes, even if the element is set up again, sends its `fetch*` events to `document`. This includes a response that replaces the element that sent it: catch its `fetchdone` with `.window`.

## Changing the page from scripts

Nagi sets up the page when it loads, and what responses bring in. When another script adds or removes elements, tell Nagi with the global `nagi`:

| Function | Description |
|---|---|
| `nagi.init(el)` | Sets up `el` and what is inside it that is not set up yet, in the scopes around it. Call it on the outermost element added, and only after it is in the page. Calling it again does nothing more |
| `nagi.destroy(el)` | Tears down `el` and what is inside it as a swap would: sends `destroy`, stops its bindings, listeners, timers and reads, and takes it out of `$refs`. Call it before or after removing `el` |

```js
nagi.destroy(row);
row.remove();
```

- An element whose `n-*` attributes change needs `nagi.destroy` and then `nagi.init`.
- When an `n-scope`, `n-let-*` or binding expression tears down an element while it is being set up, nothing inside that element is set up afterwards.
- An element may set itself up again from its own set-up (for example a binding that calls `nagi.destroy($el)` and `nagi.init($el)` once), up to 10 levels deep. Past that, Nagi stops and logs an error.
- Both log an error when given something that is not an element.
