# rbxts-transformer-wrapper
A roblox-ts transformer that allows you to "wrap" instances at compile-time.

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

Compile-time macros have zero overhead simply for existing, performance is no different than normal instances and are also more stable.

# Documentation
## How to use the macros?
Even if you define the macros using $defineCallMacros or $definePropMacros, you can't access them quite yet.
You'll have to add them to your type definitions, and there's two ways to do this.

You can declare an ambient interface to override the instance interface, like below.
```ts
// ambient.d.ts
interface Instance {
  GetComponent(name: string): Component;
  Components: Array<Component>;
}
```
Alternatively, you can make a wrapper interface, however this does require you to cast your value to the wrapper interface to work.
```ts
// anywhere.d?.ts
interface WrappedInstance {
  GetComponent(name: string): Component;
  Components: Array<Component>;
}

const wrappedInstance = instance as WrappedInstance;
```

## How to define a call macro?
Call macros must be in a ModuleScript (script.ts), and exported.
```ts
import { $defineCallMacros } from "rbxts-transformer-wrapper";

export const PROP_MACROS = $defineCallMacros<Instance>({
  GetComponent(name: string) {
    return findComponent(this, name);
  }
})
```

## How to define a property macro?
Property macros must be in a ModuleScript (script.ts), and exported.
A notable difference between property macros in runtime vs compile-time, compile-time property macros *can* yield. This isn't inherently a good or bad thing, but it can cause issues if you aren't aware of this.
```ts
import { $definePropMacros } from "rbxts-transformer-wrapper";

export const PROP_MACROS = $definePropMacros<Instance>({
  Components() {
    return getComponents(this);
  }
})
```
