# rbxts-transformer-macros
A roblox-ts transformer that allows you to add macros to instances, strings, etc at compile-time. This was specifically designed to act as a compile-time "wrapper" for instances, but works on almost any interface.

## What is the purpose of wrapping instances?
Wrapping instances is a useful way to extend functionality of Roblox's instances, as they do not provide the ability to augment them natively.

## Why use compile-time wrapping (macros), rather than runtime wrappers?
Runtime wrappers do not work well in practice, have performance overhead and require considerable thought when using them with C functions.
For example, the following code would not work if `instance` was a runtime wrapped instance, since the value you act on is not an actual instance.
```ts
const objectValue: ObjectValue = ...;
const instance = ...;

objectValue.Value = instance; // runtime error, but no compile-time error
```

To use them with native C functions, or really anything expecting an actual instance, you'd have to convert your code to something like this.
```ts
const objectValue: ObjectValue = ...;
const instance = ...;

objectValue.Value = instance.inner;
```

Compile-time macros have zero overhead simply for existing, are easier to use, and generally more convenient.

# Documentation
## How to use the macros?
Even if you define the macros using $defineCallMacros or $definePropMacros, you can't access them quite yet.
You'll have to add them to your type definitions, and there's two ways to do this.

You can declare an ambient interface to override the interface you're augmenting, like below.
```ts
// ambient.d.ts
interface Instance {
  GetComponent(name: string): Component;
  Components: Array<Component>;
}
```
Alternatively, you can make a wrapper interface, however this does require you to cast your value to the wrapper interface to work.
This method is convenient if you have macros that only work in specific contexts, e.g client/server. It is far less convenient to have to cast values, so use ambient declarations when possible.
```ts
// anywhere.d?.ts
interface WrappedInstance extends Instance {
  GetComponent(name: string): Component;
  Components: Array<Component>;
}

const wrappedInstance = instance as WrappedInstance;
const wrappedPlayer = player as Player & WrappedInstance;
```

## How to define a call macro?
Call macros must be in a ModuleScript (script.ts), and exported.
```ts
import { $defineCallMacros } from "rbxts-transformer-wrapper";

export const CALL_MACROS = $defineCallMacros<Instance>({
  GetComponent(name: string) {
    return findComponent(this, name);
  }
})
```

## How to define a property macro?
Property macros must be in a ModuleScript (script.ts), and exported.
A notable difference between property macros in runtime wrappers vs compile-time, compile-time property macros *can* yield if the macro yields. This can be a good thing, but it can also cause issues if you aren't aware of it.
```ts
import { $definePropMacros } from "rbxts-transformer-wrapper";

export const PROP_MACROS = $definePropMacros<Instance>({
  Components() {
    return getComponents(this);
  }
})
```
