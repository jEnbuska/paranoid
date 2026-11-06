import {
  type ComponentProps,
  Fragment,
  type JSX,
  type JSXElementConstructor,
  type PropsWithChildren,
} from "react";

type ConditionalProps<T extends Record<string, any>> = T extends { shown: any }
  ? never
  : T extends { Component: any }
    ? never
    : T extends { element: any }
      ? never
      : T extends never
        ? { Component: JSXElementConstructor<{}>; shown: boolean }
        : T & {
            Component: JSXElementConstructor<T>;
            shown: boolean;
          };

type ConditionalNoPropsComponentProps = {
  Component: JSXElementConstructor<{}>;
  shown: boolean;
};

type ConditionalElementProps<TElement extends keyof JSX.IntrinsicElements> = {
  element: TElement;
  shown: boolean;
} & ComponentProps<TElement>;

type ConditionalFragmentProps = PropsWithChildren<{
  shown: boolean;
  Component?: never;
}>;
export default function Conditional(
  props: ConditionalFragmentProps | ConditionalNoPropsComponentProps,
): JSX.Element | null;
export default function Conditional<
  TElement extends keyof JSX.IntrinsicElements,
>(props: ConditionalElementProps<TElement>): JSX.Element | null;
export default function Conditional<T extends Record<string, any>>(
  props: ConditionalProps<T>,
): JSX.Element | null;
export default function Conditional(props: any) {
  const { element, Component = element ?? Fragment, shown, ...rest } = props;
  if (!shown) return null;
  return (<Component {...rest} />) as any;
}
