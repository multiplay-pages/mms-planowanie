// MAP-06.1: decoding of data blocks embedded in the single-file offline planner.
// Large JSON blocks are stored as gzip + base64 to keep the file small; the browser inflates them
// locally with the built-in DecompressionStream (no network, no library).

/** Returns the JSON text of an embedded block (`encoding` is "json" or "gzip-base64"). */
export async function decodeEmbeddedText(text,encoding='json') {
  if(!encoding||encoding==='json')return text;
  if(encoding!=='gzip-base64')throw Error(`Nieobsługiwane kodowanie danych: ${encoding}`);
  if(typeof DecompressionStream!=='function')throw Error('Ta przeglądarka nie obsługuje lokalnego rozpakowania danych (DecompressionStream).');
  const binary=atob(text.trim()),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
