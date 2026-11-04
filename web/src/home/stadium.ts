/** Moves the stadium behind the page: slow drift plus a sway between screens. */
export function setStadiumDepth(y: number): void {
  const bg = document.getElementById("stadium");
  if (!bg) return;
  bg.style.setProperty("--d", y.toFixed(3));
  bg.style.setProperty("--s", Math.sin((y * Math.PI) / 2).toFixed(3));
}
