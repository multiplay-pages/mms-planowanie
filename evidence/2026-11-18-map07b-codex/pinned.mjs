import {execFileSync} from 'node:child_process';
import {registerHooks} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// Read ES modules directly from the reviewed commit while the lead edits the working tree.
registerHooks({load(url,context,next){
  if(url.startsWith('file:')){
    const filename=fileURLToPath(url);
    const relative=path.relative(process.cwd(),filename).split(path.sep).join('/');
    if(relative.startsWith('map05/')&&relative.endsWith('.mjs')){
      const source=execFileSync('git',['show','7b5427b:'+relative],{encoding:'utf8'});
      return {format:'module',source,shortCircuit:true};
    }
  }
  return next(url,context);
}});
