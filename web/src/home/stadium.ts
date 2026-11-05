/** Moves the stadium behind the page: slow drift plus a sway that is zero on every screen and largest between them. */
export function setStadiumDepth(y: number): void {
  const bg = document.getElementById("stadium");
  if (!bg) return;
  bg.style.setProperty("--d", y.toFixed(3));
  bg.style.setProperty("--s", Math.sin(y * Math.PI).toFixed(3));
}
