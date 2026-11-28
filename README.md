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

## Getting Started

### Install

Copy `dist/nagi.min.js` into your project and load it with a normal or `defer` script tag (not `async`).

```html
<script defer src="/js/nagi.min.js"></script>
```

Nagi runs the values of its attributes as JavaScript, so a Content-Security-Policy needs `'unsafe-eval'`.

### Reactive state

`n-scope` makes a scope of names. Elements inside it read them in `n-bind-*`, which keeps a property up to date, and change them in `n-on-*`, which runs on an event.

```html
<div n-scope="{ count: 0, open: false }">
  <button n-on-click="count++">+1</button>
  <span n-bind-textcontent="count"></span>

  <button n-on-click="open = !open">Details</button>
  <p n-bind-hidden="!open" n-bind-class="{ big: count > 9 }">Clicked <span n-bind-textcontent="count"></span> times.</p>
</div>
```

The values are plain JavaScript: the names of the scope are variables, `this` is the scope, and `$el` is the element. Bindings update when a name they read is assigned, so write `items = [...items, item]` rather than `items.push(item)`.

### Fetching and partial updates

`$get`, `$post` and the other request helpers send what you pass them. The server answers with HTML, and each top-level element with an `id` replaces the element with the same `id` on the page, or, with `n-swap`, is put around or inside it.

```html
<div n-scope>
  <ul id="items">
    <li>First item</li>
  </ul>
  <button n-on-click="$get('/items', { page: 2 })" n-bind-disabled="$fetching">More</button>
  <p id="status"></p>
</div>
```

The server responds with:

```html
<ul id="items" n-swap="append">
  <li>Second item</li>
</ul>
<p id="status">2 of 5 pages</p>
```

### Forms

`n-form` copies the value of each named field into the scope as the user changes it. Passing the submit event sends the form's fields.

```html
<form n-scope n-form n-on-submit.prevent="$post('/signup', e)">
  <input name="email" type="email">
  <button n-bind-disabled="!email || $fetching">Sign up</button>
  <p id="signup-result"></p>
</form>
```

The server answers with the parts to update, such as `<p id="signup-result">Thanks! Check your inbox.</p>`.

### Learn more

[docs/api.md](./docs/api.md) describes every attribute, helper, event and option in detail, with the rules to know.

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
