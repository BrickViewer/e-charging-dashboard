// Client-side regel-id voor de calculatie-editor. Alleen uniek binnen één
// bewerksessie — het bestaat om React-rijen en uitklapstatus aan een regel te
// binden, niet om iets te identificeren dat de client verlaat (de DB-insert,
// de offerteregels en het Excel noemen hun velden expliciet en laten `uid` dus
// achter). Een oplopende teller in plaats van crypto.randomUUID(): globale
// uniciteit is niet nodig, determinisme in tests wel.
let seq = 0;

export const nextUid = () => `l${++seq}`;
