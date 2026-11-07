import type { DetailedHTMLProps, HTMLAttributes } from "react";

type El = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;

/** MathML Core elements. The browsers' own renderer draws them, so no library or font is added. */
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      math: El & { display?: "block" | "inline" };
      mi: El & { mathvariant?: string };
      mn: El;
      mo: El & { stretchy?: string; lspace?: string; rspace?: string };
      mtext: El;
      mrow: El;
      msub: El;
      msup: El;
      msubsup: El;
      munder: El;
      munderover: El;
      mover: El;
      mfrac: El;
    }
  }
}
