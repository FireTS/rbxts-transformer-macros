type MacroList<T> = { [key: string]: (this: T, ...args: any[]) => unknown };

export function $defineCallMacros<T, R extends MacroList<T> = MacroList<Instance>>(macros: R): R;
export function $definePropMacros<T, R extends MacroList<T> = MacroList<Instance>>(macros: R): R;
