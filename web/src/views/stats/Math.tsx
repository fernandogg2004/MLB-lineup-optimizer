import type { ReactNode } from "react";

/**
 * Small builders for the page's formulas. Definitions follow research/paper.tex, which is the
 * authoritative statement of the mathematics.
 */
export const I = ({ children }: { children: string }) => <mi>{children}</mi>;
export const Up = ({ children }: { children: string }) => <mi mathvariant="normal">{children}</mi>;
export const N = ({ children }: { children: string | number }) => <mn>{children}</mn>;
/** Brackets keep their normal size: a subscript must not make them grow. */
export const O = ({ children }: { children: string }) => <mo stretchy={"()[]|".includes(children) ? "false" : undefined}>{children}</mo>;
export const Tx = ({ children }: { children: string }) => <mtext>{children}</mtext>;
export const Row = ({ children }: { children: ReactNode }) => <mrow>{children}</mrow>;
export const Sub = ({ b, s }: { b: ReactNode; s: ReactNode }) => (
  <msub>
    <mrow>{b}</mrow>
    <mrow>{s}</mrow>
  </msub>
);
export const Sup = ({ b, s }: { b: ReactNode; s: ReactNode }) => (
  <msup>
    <mrow>{b}</mrow>
    <mrow>{s}</mrow>
  </msup>
);
export const SubSup = ({ b, sub, sup }: { b: ReactNode; sub: ReactNode; sup: ReactNode }) => (
  <msubsup>
    <mrow>{b}</mrow>
    <mrow>{sub}</mrow>
    <mrow>{sup}</mrow>
  </msubsup>
);
export const Frac = ({ n, d }: { n: ReactNode; d: ReactNode }) => (
  <mfrac>
    <mrow>{n}</mrow>
    <mrow>{d}</mrow>
  </mfrac>
);
export const Under = ({ op, s }: { op: ReactNode; s: ReactNode }) => (
  <munder>
    <mrow>{op}</mrow>
    <mrow>{s}</mrow>
  </munder>
);
export const SumOver = ({ from, to }: { from: ReactNode; to?: ReactNode }) =>
  to ? (
    <munderover>
      <mo>∑</mo>
      <mrow>{from}</mrow>
      <mrow>{to}</mrow>
    </munderover>
  ) : (
    <munder>
      <mo>∑</mo>
      <mrow>{from}</mrow>
    </munder>
  );
export const Pi = () => <mi>π</mi>;
export const Tr = () => <mi mathvariant="normal">⊤</mi>;

export function Eq({ children, label, inline }: { children: ReactNode; label: string; inline?: boolean }) {
  return (
    <span className={inline ? "st-math-inline" : "st-math"} tabIndex={inline ? undefined : 0} role={inline ? undefined : "group"} aria-label={inline ? undefined : label}>
      <math display={inline ? "inline" : "block"}>{children}</math>
    </span>
  );
}

/** π* = argmax V(π), V(π) = E[R₉ | π, I]. */
export function ObjectiveFormula({ label }: { label: string }) {
  return (
    <Eq label={label}>
      <Sup b={<Pi />} s={<O>*</O>} />
      <O>=</O>
      <Under op={<mi mathvariant="normal">arg max</mi>} s={<Row><Pi /><O>∈</O><Sub b={<I>S</I>} s={<N>9</N>} /></Row>} />
      <O>&#8201;</O>
      <Up>𝔼</Up>
      <O>[</O>
      <Sub b={<I>R</I>} s={<N>9</N>} />
      <O>∣</O>
      <Pi />
      <O>,</O>
      <mi>ℐ</mi>
      <O>]</O>
    </Eq>
  );
}
