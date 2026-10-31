/* RFC-style quoted CSV; prefix formula-like text for common spreadsheet apps. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.TerraCSV=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function cell(value){let s=String(value??'');if(/^[\s\u0000-\u001f]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
 function serialize(rows){return '\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';}
 return {cell,serialize};
});
