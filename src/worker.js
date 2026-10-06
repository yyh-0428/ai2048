'use strict';
const WASM_B64='AGFzbQEAAAABTgpgAAF8YA1/f39/f39/f3x/f398AX9gAX4BfGAEfn98fwF8YA5/f39/f39/f398f39/fAF/YAAAYAN/f38Bf2ACf38BfGAAAX9gAX8BfAIOAQNlbnYGbm93X21zAAADDg0BAgMEBQYHCAkICAYDBAUBcAEBAQUEAQCQAQYJAX8BQdCJvAQLB38KBm1lbW9yeQIAC2luaXRfdGFibGVzAAsIY2xlYXJfdHQABQxhbmFseXplX3Jvb3QABA1hbmFseXplX2V4YWN0AAEJZ2V0X2RlcHRoAAgJZ2V0X2xldmVsAAkJZ2V0X25vZGVzAAoKZXZhbF9ib2FyZAAHCW1vdmVfdGVzdAAMCppFDboCAQJ+QQAgBjYChIiAgABBACAFNgKAiICAAEEAIAc2AoiIgIAAQQAgCDkDkIiAgABBACAJNgKwiJiCAEEAIAs2ApiIgIAAQQAgDDkDoIiAgABBAEF/IAp0QX9zNgKoiICAAEEAQQA2ArSImIIAQQBBADYCuIiYggAgAa1CIIYhDSAArSEOQQEhBgJAAkAgBEEBTg0AROqMoDlZPilGIQhBACEGDAELEICAgIAAIAS4oCEICyANIA6EIQ1BACAGNgKsiICAAEEAIAg5A8CImIIAAkACQCADQQBKDQAgDRCCgICAACEIDAELIA0gA0F/akQAAAAAAADwP0EAEIOAgIAAIQgLQQAgAzYCuIiYggBBAEEBNgKsiICAACADQQN0QdCImIIAaiACuERmZmZmZmYEQKIgCKA5AwBBAQueDgYBfwJ+FH8IfCB9BnxBAEEAKAK0iJiCAEEBaiIBNgK0iJiCAAJAAkBBACgCrIiAgABFDQAgAUH/D3ENABCAgICAAEEAKwPAiJiCAGQNAQsgAEIMhkKAgLz4gIDAhw+DIABCj57Ah//hg/hwg4QgAEIMiELw4YOAgJ48g4QiAkIYiEKA/oP4D4MgAkL/gfyHgOC/gH+DhCIDpyIBQRB2IQQgAKciBUEQdiIGQbCInIAAai0AACAFQf//A3EiB0GwiJyAAGotAABqIABCIIinQf//A3EiCEGwiJyAAGotAABqIABCMIinIglBsIicgABqLQAAaiIKQQVJIQsgAUH//wNxIQwgAyACQhiGQoCAgIDwn8D/AIOEIgJCMIinIQ0gAkIgiKdB//8DcSEOAkACQCAGQbCIpIAAai0AACIBIAdBsIikgABqLQAAIgVLDQAgB0GwiKiAAGotAAAhDwwBCyAGQbCIqIAAai0AAEEEaiEPIAEhBQsgBEEDdCEQQbCIzIAAQbCIrIAAIAsbIQEgDEEDdCELIA1BA3QhESAOQQN0IRIgCUEDdCETIAhBA3QhFCAGQQN0IRUgB0EDdCEWAkAgCEGwiKSAAGotAAAiFyAFTQ0AIAhBsIiogABqLQAAQQhqIQ8gFyEFCyABIBBqIRAgASALaiELIAEgEWohESABIBJqIRIgASATaiETIAEgFGohFCABIBVqIRUgASAWaiEBAkAgCUGwiKSAAGotAAAiFiAFTQ0AIAlBsIiogABqLQAAQQxqIQ8gFiEFCyAQKwMAIRggCysDACEZIBErAwAhGiASKwMAIRsgEysDACEcIBQrAwAhHSAVKwMAIR4gASsDACEfIA1BAnQiAUGwiNyBAGoqAgAhICAOQQJ0Ig1BsIisgQBqKgIAISEgBEECdCIEQbCInIEAaioCACEiIAxBAnQiDEGwiOyAAGoqAgAhIyABQbCIzIEAaioCACEkIA1BsIi8gQBqKgIAISUgBEGwiIyBAGoqAgAhJiAMQbCI/IAAaioCACEnIAxBsIjcgQBqKgIAISggBEGwiKyBAGoqAgAhKSANQbCInIEAaioCACEqIAFBsIjsgABqKgIAISsgDEGwiMyBAGoqAgAhLCAEQbCIvIEAaioCACEtIA1BsIiMgQBqKgIAIS4gAUGwiPyAAGoqAgAhLyAJQQJ0IgFBsIjcgQBqKgIAITAgCEECdCIIQbCIrIEAaioCACExIAZBAnQiBkGwiJyBAGoqAgAhMiAHQQJ0IgdBsIjsgABqKgIAITMgAUGwiMyBAGoqAgAhNCAIQbCIvIEAaioCACE1IAZBsIiMgQBqKgIAITYgB0GwiPyAAGoqAgAhNyAHQbCI3IEAaioCACE4IAZBsIisgQBqKgIAITkgCEGwiJyBAGoqAgAhOiABQbCI7IAAaioCACE7IAdBsIjMgQBqKgIAITwgBkGwiLyBAGoqAgAhPSAIQbCIjIEAaioCACE+IAFBsIj8gABqKgIAIT9EAAAAAACAcUAhQAJAIA9BdGpBeEkNACAPQQNxIgFFDQBEAAAAAACAcUBEAAAAAACAdsAgAUEDRhshQAsgCrgiQUQAAAAAAACZQKIgBbhEAAAAAAA4mEBEAAAAAABwkkAgCkEFSSIBGyBAQYmgAiAPdkEBcRsgQCAPQRBJG6IgMyAykiAxkiAwkrsiQCA3IDaSIDWSIDSSuyJCIDsgOpIgOZIgOJK7IkMgPyA+kiA9kiA8krsiREQAyE5nbcGrwyBERADITmdtwavDZBsiRCBEIENjGyJDIEMgQmMbIkIgQiBAYxsiQCAjICKSICGSICCSuyJCICcgJpIgJZIgJJK7IkMgKyAqkiApkiAokrsiRCAvIC6SIC2SICySuyJFRADITmdtwavDIEVEAMhOZ23Bq8NkGyJFIEUgRGMbIkQgRCBDYxsiQyBDIEJjGyJCIEAgQmQbRLgehetRuPY/REjhehSuR/E/IAEboiBBRAAAAAAAcKdARAAAAAAABKBAIAEboiAfIB6gIB2gIBygIBmgIBigIBugIBqgoKAgAEKAgICAgB6DQgBSIABC8AGDQgBSIABCgIA8g0IAUiAAQoCAgPgAg0IAUnEgAEIUiEIPgyICQn98QgNUcXFxIgEgASABIAEgAUECQQEgARsgAEIYiEIPgyIDQnx8Qn1UGyAAQoCAgIAPg1AbIABCgB6DUBsgAlAiBRsgAEKAgICAgOADg1AiARsgBSABIABCgICAgPABg1AgAEKAgICAgICA+ACDUHIgAEIkiEIPgyICQnx8Qn1UcnJyQQFzaiAAQoCAgICAgICAD4NCAFIgA0IAUiACQgBSIABCgICAgICAPINCAFJxIABCKIinQQ9xQX9qQQNJcXFxarhEAAAAAACAZsCioKAiQKAgQCAKQQNJGw8LAAuwDAcEfwF8BX8EfAF/A3wBfkEAIQQCQAJAAkBBACgCmIiAgAAgAUwNACAAQiCIpyEFIACnIQYMAQsCQCACRHsUrkfherQ/ZA0AQcAAIQQgAkQ730+Nl26SP2QNAEGAAUHAASACRPyp8dJNYnA/ZBshBAsgAEIgiKciBUGx893xeWwgAUEfcSAEckEAKAKwiJiCAEEIdEGABnFyQSByIgdB65Svr3hscyAApyIGcyIEQRB2IARzQa3qrP8HbCIEQQ92IARzQYvNsqN4bCIEQRB2IARzQQAoAqiIgIAAcSIEQbCIiIIAai0AAEUNACAEQQN0QdCJmIIAaikDACAAUg0AIARBAXRB0ImYgwBqLwEAIAdHDQAgBEEDdEHQibiDAGorAwAhCAwBCwJAIAZBEHYiBEGwiJyAAGotAAAgBkH//wNxIgdBsIicgABqLQAAaiAFQf//A3EiCUGwiJyAAGotAABqIABCMIinIgpBsIicgABqLQAAaiILDQAgACABIAIgA0EBahCNgICAAA8LIARBsIiggABqLQAAQQR0IAdBsIiggABqLQAAciEEIAlBsIiggABqLQAAQQh0IQcgCkGwiKCAAGotAAAhCSALIQwCQEEAKAKEiICAACADSiALQQAoAoiIgIAATHIiDQ0AIAtBf0EAIANBAkobIANBBEprQQAoAoCIgIAAaiIKQQIgCkECShsiCiALIApJGyEMCyAEIAdyIQQgCUEMdCEHIAJEmpmZmZmZuT+iIQ5EAAAAAAAA8D8gC7giD6MhCCACRM3MzMzMzOw/oiEQAkACQCADt0QD7S8378bjP6IiEZlEAAAAAAAA4EFjRQ0AIBGqIRIMAQtBgICAgHghEgsgDiAIoiETIBAgCKIhECADQQFqIQogBCAHQYDgA3FyIQkgDLghFAJAAkAgDQ0AIBEgErehIRVBACENRAAAAAAAAAAAIQhEAAAAAAAAAAAhDgNAAkACQCAVIA6gIA+iIBSjIhGZRAAAAAAAAOBBY0UNACARqiEEDAELQYCAgIB4IQQLIAkhAwJAIAQgC28iB0EBSA0AIAkhAyAHIRICQCAHQQdxIgRFDQAgB0H4////B3EhEiAJIQMDQCADQX9qIANxIQMgBEF/aiIEDQALCyAHQQhJDQAgEkF/aiEEA0AgA0F/aiADcSIDQX9qIANxIgNBf2ogA3EiA0F/aiADcSIDQX9qIANxIgNBf2ogA3EiA0F/aiADcSIDQX9qIANxIQMgBEF4aiIEQX5JDQALCyAIQgEgA2hBAnStIhaGIACEIAEgECAKEI2AgIAARM3MzMzMzOw/okICIBaGIACEIAEgEyAKEI2AgIAARJqZmZmZmbk/oqCgIQggDkQAAAAAAADwP6AhDiANQQFqIg0gDEcNAAwCCwtBACENRAAAAAAAAAAAIQhBACEHA0AgCSEDAkAgB0UNACAJIQMgByELAkAgB0EHcUUNACAHIA1BB3EiBGshCyAJIQMDQCADQX9qIANxIQMgBEF/aiIEDQALCyAHQQhJDQAgC0F/aiEEA0AgA0F/aiADcSIDQX9qIANxIgNBf2ogA3EiA0F/aiADcSIDQX9qIANxIgNBf2ogA3EiA0F/aiADcSIDQX9qIANxIQMgBEF4aiIEQX5JDQALCyAIQgEgA2hBAnStIhaGIACEIAEgECAKEI2AgIAARM3MzMzMzOw/okICIBaGIACEIAEgEyAKEI2AgIAARJqZmZmZmbk/oqCgIQggDUEBaiENIAdBAWoiByAMRw0ACwsgCCAUoyEIQQAhA0EAKAKYiICAACABSg0AAkAgAkR7FK5H4Xq0P2QNAEHAACEDIAJEO99PjZdukj9kDQBBgAFBwAEgAkT8qfHSTWJwP2QbIQMLIAVBsfPd8XlsIAFBH3EgA3JBACgCsIiYggBBCHRBgAZxckEgciIEQeuUr694bHMgBnMiA0EQdiADc0Gt6qz/B2wiA0EPdiADc0GLzbKjeGwiA0EQdiADc0EAKAKoiICAAHEiA0GwiIiCAGpBAToAACADQQN0IgdB0ImYggBqIAA3AwAgA0EBdEHQiZiDAGogBDsBACAHQdCJuIMAaiAIOQMAIAgPCyAIC+cCAQF+QQAgBzYChIiAgABBACAGNgKAiICAAEEAIAg2AoiIgIAAQQAgCTkDkIiAgABBACAKNgKwiJiCAEEAIAw2ApiIgIAAQQAgDTkDoIiAgABBAEF/IAt0QX9zNgKoiICAAEEAQQA2ArSImIIAQQBBADYCuIiYggBBABCAgICAACADt6A5A8CImIIAQQAgArhEZmZmZmZmBECiIg0gAa1CIIYgAK2EIg4QgoCAgACgOQPQiJiCAAJAIARBAUgNAEHYiJiCACEGQQEhBwNAQQAgByAFSjYCrIiAgAACQCAHIAVMDQAQgICAgABBACsDwIiYggBkDQILIA4gB0F/akQAAAAAAADwP0EAEIOAgIAAIQlBACAHNgK4iJiCACAGIA0gCaA5AwAQgICAgABBACsDwIiYggBkDQEgBkEIaiEGIAcgBEchCCAHQQFqIQcgCA0ACwtBAEEBNgKsiICAAEEAKAK4iJiCAAsVAEGwiIiCAEEAQYCAEBCGgICAABoLtQEBA38CQCACRQ0AIAJBB3EhA0EAIQQCQCACQQhJDQAgAkF4cSEFQQAhBANAIAAgBGoiAiABOgAAIAJBB2ogAToAACACQQZqIAE6AAAgAkEFaiABOgAAIAJBBGogAToAACACQQNqIAE6AAAgAkECaiABOgAAIAJBAWogAToAACAFIARBCGoiBEcNAAsLIANFDQAgACAEaiECA0AgAiABOgAAIAJBAWohAiADQX9qIgMNAAsLIAALMQBBAELqmYLNk8vPlMYANwPAiJiCAEEAQQA2ArSImIIAIAGtQiCGIACthBCCgICAAAsLAEEAKAK4iJiCAAssAQF8RAAAAAAAAAAAIQECQCAAQQ9LDQAgAEEDdEHQiJiCAGorAwAhAQsgAQsLAEEAKAK0iJiCAAuDDwYMfwF8AX8CfAV/AXwjgICAgABBIGsiAEEQakEEciEBQQAhAgNAIAJBBHZBD3EhAwJAAkAgAkEPcSIEDQAgAEEQaiEFQQEhBkEBIQdBACEIDAELIAAgBDYCEEEBIQhBACEGQQAhByABIQULIAJBCHZBD3EhCQJAAkAgA0UNACAFIAM2AgAgCEEBaiEIDAELIAZBAnIhBiAHQQFqIQcLAkACQCAJRQ0AIABBEGogCEECdHIgCTYCACAIQQFqIQgMAQsgBkEEciEGIAdBAWohBwsgAkEMdiEKAkACQCACQYAgSSILDQAgAEEQaiAIQQJ0aiAKNgIAIAhBAWohCAwBCyAGQQhyIQYgB0EBaiEHCyAEIANrIQUCQAJAAkAgBEUNAAJAIAMNAEQAAAAAAAAAACEMIAUhDUEAIQVEAAAAAAAAAAAhDgwDCyAEuES4HoXrUbi+P6JEAAAAAAAA8D+gRAAAAAAAAAAAoEQAAAAAAAAAACAEIANGGyEPRAAAAAAAAAAAIAUgBUEfdSIQcyAQa7ihIQ4gBUEAIAVBAEobIQ0gECAFcSEFDAELRAAAAAAAAAAAIQ5BACENRAAAAAAAAAAAIQ9EAAAAAAAAAAAhDCADRQ0BCwJAIAkNACAPIQwMAQsgDiADIAlrIhAgEEEfdSIQcyAQa7ihIQ4CQCADIAlGDQAgDyEMDAELIA8gA7hEuB6F61G4vj+iRAAAAAAAAPA/oKAhDAsgAyAJayIQQQAgEEEAShsgDWohDSAFIBBBH3UgEHFqIRAgCSAKayEFAkAgCUUNACALDQAgDiAFIAVBH3UiC3MgC2u4oSEOIAkgCkcNACAMIAm4RLgehetRuL4/okQAAAAAAADwP6CgIQwLIABCADcDCCAAQgA3AwBBACERIAVBACAFQQBKGyANaiESQQAgECAFQR91IAVxamshEwJAAkAgCA0AQQAhFEEAIRAMAQtBACEFIAAhEEEAIRRBACERA0AgAEEQaiAFQQJ0aigCACENAkACQCAFQQFqIgsgCE4NACANIABBEGogC0ECdGooAgBHDQAgEEEPIA1BAWoiCyANQQ5KIg0bNgIAQQEgFCANGyEUIAVBAmohBUEBIAt0IBFqIREMAQsgECANNgIAIAshBQsgEEEEaiEQIAUgCEgNAAsgACgCBEEEdCAAKAIAciAAKAIIQQh0ciAAKAIMQQx0ciEQCyACQbCImIAAaiAUOgAAIAJBsIicgABqIAc6AAAgAkGwiKCAAGogBjoAACACQQJ0IgVBsIiIgABqIBE2AgAgAkEBdEGwiICAAGogEDsBACACQQN0IhBBsIisgABqIA5EAAAAAAAASkCiIAxEAAAAAABAgECioCIOIBMgEiATIBJIG7giDEQAAAAAAOBwwKKgOQMAIBBBsIjMgABqIA4gDEQAAAAAAKB0wKKgOQMAIAJBsIikgABqIAogCSADIAQgAyAEShsiECAJIBBKGyINIAogDUobOgAAIAJBsIiogABqQQNBAiAEIANJIAkgEEsbIAogDUsbOgAAIAVBsIjsgABqIAq4Ig5EOETcnEoGBUCiIAm4IgxE0wloImx4/j+iIAO4Ig9EFK5H4XoU9j+iIAS4IhWgoKC2OAIAIAVBsIj8gABqIBVEOETcnEoGBUCiIA9E0wloImx4/j+iIAxEFK5H4XoU9j+iIA6goKC2OAIAIAVBsIiMgQBqIA5EDX7xxAoQI0CiIAxEPMkTVYagG0CiIA9EiZWxlgQFFECiIBVEGYfy7I8DDUCiRAAAAAAAAAAAoKCgoLY4AgAgBUGwiJyBAGogFUQNfvHEChAjQKIgD0Q8yRNVhqAbQKIgDESJlbGWBAUUQKIgDkQZh/LsjwMNQKJEAAAAAAAAAACgoKCgtjgCACAFQbCIrIEAaiAORC86VACpSEFAoiAMRLd1mwuNDDlAoiAPROJNqKvGJjJAoiAVROhW+0J1TipAokQAAAAAAAAAAKCgoKC2OAIAIAVBsIi8gQBqIBVELzpUAKlIQUCiIA9Et3WbC40MOUCiIAxE4k2oq8YmMkCiIA5E6Fb7QnVOKkCiRAAAAAAAAAAAoKCgoLY4AgAgBUGwiMyBAGogDkTi5aRpi1dfQKIgDEQBrk6pKbZWQKIgD0SH+N9RKXVQQKIgFUTaEhjxB9pHQKJEAAAAAAAAAACgoKCgtjgCACAFQbCI3IEAaiAVROLlpGmLV19AoiAPRAGuTqkptlZAoiAMRIf431EpdVBAoiAORNoSGPEH2kdAokQAAAAAAAAAAKCgoKC2OAIAIAJBAWoiAkGAgARHDQALQQAhBUGwiPSBACENQbCI7IEAIQgDQCAFQbCIhIIAaiAFQQR0QYAecSAFQQx0ciAFQQR2QfABcXIgBUGA4ANxQQx2ckH//wNxIhBBsIiYgABqLQAAOgAAIA0gEEECdEGwiIiAAGooAgA2AgAgCCAQQQF0QbCIgIAAai8BACIQQQR0QYAecSAQQQx0ciAQQQR2QfABcXIgEEEMdnI7AQAgCEECaiEIIA1BBGohDSAFQQFqIgVBgIAERw0AC0EBC/kDBAJ+A38BfgF/IAGtQiCGIACthCIDIQQCQAJAIAIOBAABAQABCyADQgyGQoCAvPiAgMCHD4MgA0KPnsCH/+GD+HCDhCADQgyIQvDhg4CAnjyDhCIEQhiIQoD+g/gPgyAEQv+B/IeA4L+Af4OEIARCGIZCgICAgPCfwP8Ag4QhBAtBsIiAgABBsIjsgQAgAkECSSIAGyIBIASnIgVBEHYiBkEBdGozAQBCEIYgASAFQf//A3EiBUEBdGozAQCEIAEgBEIgiKdB//8DcSIHQQF0ajMBAEIghoQiCCABIARCMIinIglBAXRqMwEAQjCGhCEEAkACQCACDgQAAQEAAQsgCEIMhkKAgLz4gIDAhw+DIARCj57Ah//hg/hwg4QgBEIMiELw4YOAgJ48g4QiBEIYiEKA/oP4D4MgBEL/gfyHgOC/gH+DhCAEQhiGQoCAgIDwn8D/AIOEIQQLQQAgBEIgiKe4OQPYiJiCAEEAQbCIiIAAQbCI9IEAIAAbIgIgBkECdGooAgAgAiAFQQJ0aigCAGogAiAHQQJ0aigCAGogAiAJQQJ0aigCAGq4OQPQiJiCAEEAQbCImIAAQbCIhIIAIAAbIgIgBmotAAAgAiAFai0AAHIgAiAHai0AAHIgAiAJai0AAHJBAXQgBCADUnI2AriImIIAIASnC9wPBgN/An4DfwJ8Bn8BfAJAAkAgAUEBSA0AQQArA5CIgIAAIAJkRQ0BCyAAEIKAgIAADwtBACEEAkACQAJAAkBBACgCmIiAgAAgAUoNAAJAIAJEexSuR+F6tD9kDQBBwAAhBCACRDvfT42XbpI/ZA0AQYABQcABIAJE/Knx0k1icD9kGyEECyAAQiCIp0Gx893xeWwgAKdzIAQgAUEfcXJBACgCsIiYggBBCHRBgAZxciIFQeuUr694bHMiBEEQdiAEc0Gt6qz/B2wiBEEPdiAEc0GLzbKjeGwiBEEQdiAEc0EAKAKoiICAAHEiBEGwiIiCAGotAABFDQAgBEEDdEHQiZiCAGopAwAgAFINACAEQQF0QdCJmIMAai8BACAFRg0BCyABQX9qIQYgAEIMhkKAgLz4gIDAhw+DIABCj57Ah//hg/hwg4QgAEIMiELw4YOAgJ48g4QiB0IYiEKA/oP4D4MgB0L/gfyHgOC/gH+DhCIIpyIFQRB2IgRBAXRBsIiAgABqMwEAQhCGIAVB//8DcSIFQQF0QbCIgIAAajMBAIQgCCAHQhiGQoCAgIDwn8D/AIOEIgdCIIinQf//A3EiCUEBdEGwiICAAGozAQBCIIaEIghCDIZCgIC8+ICAwIcPgyAIIAdCMIinIgpBAXRBsIiAgABqMwEAQjCGhCIHQo+ewIf/4YP4cIOEIAdCDIhC8OGDgICePIOEIgdCGIhCgP6D+A+DIAdC/4H8h4Dgv4B/g4QgB0IYhkKAgICA8J/A/wCDhCIHIABSDQFBACELRADITmdtwavDIQwMAgsgBEEDdEHQibiDAGorAwAPCyAEQQJ0QbCIiIAAaigCACAFQQJ0QbCIiIAAaigCAGogCUECdEGwiIiAAGooAgBqIApBAnRBsIiIgABqKAIAarghDAJAAkAgBEGwiJiAAGotAAAgBUGwiJiAAGotAAByIAlBsIiYgABqLQAAciAKQbCImIAAai0AAHJFDQBBACsDoIiAgAAhDQwBCyAHIAYgAiADEIOAgIAAIQ0LIAxEZmZmZmZmBECiIA2gIgxEAMhOZ23Bq8MgDEQAyE5nbcGrw2QbIQxBASELCwJAIACnIg5BEHYiD0EBdEGwiICAAGozAQBCEIYgDkH//wNxIhBBAXRBsIiAgABqMwEAhCAAQiCIpyIRQf//A3EiEkEBdEGwiICAAGozAQBCIIaEIABCMIinIhNBAXRBsIiAgABqMwEAQjCGhCIHIABRDQAgD0ECdEGwiIiAAGooAgAgEEECdEGwiIiAAGooAgBqIBJBAnRBsIiIgABqKAIAaiATQQJ0QbCIiIAAaigCAGq4IQ0CQAJAIA9BsIiYgABqLQAAIBBBsIiYgABqLQAAciASQbCImIAAai0AAHIgE0GwiJiAAGotAAByRQ0AQQArA6CIgIAAIRQMAQsgByAGIAIgAxCDgICAACEUCyANRGZmZmZmZgRAoiAUoCINIAwgDSAMZBshDEEBIQsLAkAgD0EBdEGwiOyBAGozAQBCEIYgEEEBdEGwiOyBAGozAQCEIBJBAXRBsIjsgQBqMwEAQiCGhCATQQF0QbCI7IEAajMBAEIwhoQiByAAUQ0AIA9BAnRBsIj0gQBqKAIAIBBBAnRBsIj0gQBqKAIAaiASQQJ0QbCI9IEAaigCAGogE0ECdEGwiPSBAGooAgBquCENAkACQCAPQbCIhIIAai0AACAQQbCIhIIAai0AAHIgEkGwiISCAGotAAByIBNBsIiEggBqLQAAckUNAEEAKwOgiICAACEUDAELIAcgBiACIAMQg4CAgAAhFAsgDURmZmZmZmYEQKIgFKAiDSAMIA0gDGQbIQxBASELCwJAAkACQCAEQQF0QbCI7IEAajMBAEIQhiAFQQF0QbCI7IEAajMBAIQgCUEBdEGwiOyBAGozAQBCIIaEIgdCDIZCgIC8+ICAwIcPgyAHIApBAXRBsIjsgQBqMwEAQjCGhCIHQo+ewIf/4YP4cIOEIAdCDIhC8OGDgICePIOEIgdCGIhCgP6D+A+DIAdC/4H8h4Dgv4B/g4QgB0IYhkKAgICA8J/A/wCDhCIHIABRDQAgBEECdEGwiPSBAGooAgAgBUECdEGwiPSBAGooAgBqIAlBAnRBsIj0gQBqKAIAaiAKQQJ0QbCI9IEAaigCAGq4IQ0CQAJAIARBsIiEggBqLQAAIAVBsIiEggBqLQAAciAJQbCIhIIAai0AAHIgCkGwiISCAGotAAByRQ0AQQArA6CIgIAAIRQMAQsgByAGIAIgAxCDgICAACEUCyANRGZmZmZmZgRAoiAUoCINIAwgDSAMZBshDAwBCyALDQBEAAA0JvVrDMMhDAwBC0EAIQRBACgCmIiAgAAgAUoNAAJAIAJEexSuR+F6tD9kDQBBwAAhBCACRDvfT42XbpI/ZA0AQYABQcABIAJE/Knx0k1icD9kGyEECyARQbHz3fF5bCAEIAFBH3FyQQAoArCImIIAQQh0QYAGcXIiBEHrlK+veGxzIA5zIgFBEHYgAXNBreqs/wdsIgFBD3YgAXNBi82yo3hsIgFBEHYgAXNBACgCqIiAgABxIgFBsIiIggBqQQE6AAAgAUEDdCIFQdCJmIIAaiAANwMAIAFBAXRB0ImYgwBqIAQ7AQAgBUHQibiDAGogDDkDACAMDwsgDAsLNwEAQYAICzAEAAAAAQAAAAMAAAAAAAAAYTJVMCqpMz8CAAAAAAAAAAAAAACAhD5B//8AAAEAAAAA1gEEbmFtZQAQD2VuZ2luZV92N2Uud2FzbQGeAQ4ABm5vd19tcwENYW5hbHl6ZV9leGFjdAIIZXZhbHVhdGUDC2NoYW5jZV9ub2RlBAxhbmFseXplX3Jvb3QFCGNsZWFyX3R0BgZtZW1zZXQHCmV2YWxfYm9hcmQICWdldF9kZXB0aAkJZ2V0X2xldmVsCglnZXRfbm9kZXMLC2luaXRfdGFibGVzDAltb3ZlX3Rlc3QNCG1heF9ub2RlBxIBAA9fX3N0YWNrX3BvaW50ZXIJCAEABS5kYXRhAH8JcHJvZHVjZXJzAQxwcm9jZXNzZWQtYnkBBWNsYW5nXzE3LjAuMCAoaHR0cHM6Ly9naXRodWIuY29tL3N3aWZ0bGFuZy9sbHZtLXByb2plY3QuZ2l0IDEwOTk5YjZkMDM0ZmUzMThmM2Q1NmM4M2JkZGI2NTcyNTkzYThiYjApAEkPdGFyZ2V0X2ZlYXR1cmVzBCsKbXVsdGl2YWx1ZSsPbXV0YWJsZS1nbG9iYWxzKw9yZWZlcmVuY2UtdHlwZXMrCHNpZ24tZXh0';
const SURVIVAL_WASM_B64='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';
const V102_WASM_B64='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AABDFsGLQ79FBESI32JE8wS1RACwCEVxpEVFbPOJRb4Pu0Uri/dFbmwgRkY9TEYAAAAAAACAPwAAgEEAAKJCAACAQwBAHEQAAKJEABAWRQAAgEUACM1FAEAcRgDEZEYAAKJGACLfRgAQFkcAwUVHAEGACQsCAQAAlAEEbmFtZQAQD3YxMDJfZW1wdHkud2FzbQFUBgAJdjEwMl9pbml0ARB2MTAyX3Njb3JlX2RlcHRoAgtjaGFuY2Vfbm9kZQMKdjEwMl9zY29yZQQKdjEwMl9ub2RlcwUPdjEwMl9jYWNoZV9oaXRzBxIBAA9fX3N0YWNrX3BvaW50ZXIJEQIABy5yb2RhdGEBBS5kYXRhAH8JcHJvZHVjZXJzAQxwcm9jZXNzZWQtYnkBBWNsYW5nXzE3LjAuMCAoaHR0cHM6Ly9naXRodWIuY29tL3N3aWZ0bGFuZy9sbHZtLXByb2plY3QuZ2l0IDEwOTk5YjZkMDM0ZmUzMThmM2Q1NmM4M2JkZGI2NTcyNTkzYThiYjApAEkPdGFyZ2V0X2ZlYXR1cmVzBCsKbXVsdGl2YWx1ZSsPbXV0YWJsZS1nbG9iYWxzKw9yZWZlcmVuY2UtdHlwZXMrCHNpZ24tZXh0';
let WASM=null,WASM_FAILED=false,SURVIVAL_WASM=null,V102_WASM=null;
const SURVIVAL_READY=(async()=>{try{const bin=atob(SURVIVAL_WASM_B64),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);const mod=await WebAssembly.instantiate(bytes,{});SURVIVAL_WASM=mod.instance.exports;SURVIVAL_WASM.init_tables();return SURVIVAL_WASM}catch(e){return null}})();
const V102_READY=(async()=>{try{const bin=atob(V102_WASM_B64),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);const mod=await WebAssembly.instantiate(bytes,{});V102_WASM=mod.instance.exports;V102_WASM.v102_init();return V102_WASM}catch(e){return null}})();
const WASM_READY=(async()=>{
  try{
    const bin=atob(WASM_B64),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
    const mod=await WebAssembly.instantiate(bytes,{env:{now_ms:()=>performance.now()}});WASM=mod.instance.exports;WASM.init_tables();return WASM;
  }catch(e){WASM_FAILED=true;return null;}
})();
function pack4(board){let lo=0,hi=0,n15=0;for(let i=0;i<16;i++){let v=board[i],r=0;while(v>1){v=Math.floor(v/2);r++}if(r>=15)return null;if(i<8)lo=(lo|(r<<(i*4)))>>>0;else hi=(hi|(r<<((i-8)*4)))>>>0}return[lo>>>0,hi>>>0]}
// The value core can represent rank 15 exactly, provided no rank-16 merge
// is reachable within its entire horizon. Each spawn adds at most four mass.
function packValue4(board,depth){
  if(!Array.isArray(board)||board.length!==16||!Number.isInteger(depth)||depth<2||depth>6)return null;
  let lo=0,hi=0,mass=0;
  for(let i=0;i<16;i++){
    const v=board[i];
    if(v!==0&&!(Number.isInteger(v)&&v>=2&&v<=32768&&(v&(v-1))===0))return null;
    const r=v===0?0:31-Math.clz32(v);
    mass+=v;if(i<8)lo|=r<<(i*4);else hi|=r<<((i-8)*4);
  }
  return mass+4*depth<65536?[lo>>>0,hi>>>0]:null;
}
function checkedValueWords(lo,hi,depth){
  if(!Number.isInteger(lo)||lo<0||lo>4294967295||!Number.isInteger(hi)||hi<0||hi>4294967295||!Number.isInteger(depth)||depth<2||depth>6)return null;
  let mass=0;for(const word of [lo,hi])for(let i=0;i<8;i++){const r=(word>>>(4*i))&15;if(r)mass+=1<<r;}
  return mass+4*depth<65536?[lo,hi]:null;
}
async function v102Exact(board,depth=3,words=null){
  const w=await V102_READY;if(!w)return null;const p=words?checkedValueWords(words[0],words[1],depth):packValue4(board,depth);if(!p)return null;const start=performance.now();
  try{const score=depth===3?w.v102_score(p[0],p[1]):w.v102_score_depth(p[0],p[1],depth|0);return{ok:true,depth:depth|0,score,nodes:w.v102_nodes()>>>0,time:performance.now()-start,engine:'v10.3-wasm-expectimax',cacheHits:w.v102_cache_hits()>>>0};}
  catch(e){return{ok:false,depth:depth|0,score:NaN,nodes:0,time:performance.now()-start,engine:'v10.3-wasm-expectimax'};}
}
async function wasmRoot(board,gain,cfg){
  const w=await WASM_READY;if(!w)return null;const p=pack4(board);if(!p)return null;const start=performance.now();
  try{w.analyze_root(p[0],p[1],gain>>>0,Math.max(1,Math.ceil(cfg.budget)),cfg.maxDepth,cfg.minDepth||0,cfg.sampleCap,cfg.exactPlies,cfg.exactWhenEmpty,cfg.probCut,cfg.phase||0,cfg.ttBits,cfg.cacheMinDepth,cfg.overflowBonus||2000000)}catch(e){if(!(e instanceof WebAssembly.RuntimeError)){WASM_FAILED=true;return null}}
  const depth=w.get_depth()|0,levels=new Array(depth+1);for(let i=0;i<=depth;i++)levels[i]=w.get_level(i);return{depth,levels,nodes:w.get_nodes()>>>0,time:performance.now()-start,engine:'wasm64'};
}
async function wasmExact(board,gain,depth,cfg,hardBudget=0){
  if(cfg.forceJS)return null;
  const w=await WASM_READY;if(!w)return null;const p=pack4(board);if(!p)return null;const start=performance.now();
  try{
    w.clear_tt();
    w.analyze_exact(p[0],p[1],gain>>>0,depth|0,Math.max(0,Math.ceil(hardBudget||0)),cfg.sampleCap,cfg.exactPlies,cfg.exactWhenEmpty,cfg.probCut,cfg.phase||0,cfg.ttBits,cfg.cacheMinDepth,cfg.overflowBonus||2000000);
  }catch(e){
    if(e instanceof WebAssembly.RuntimeError)return{ok:false,depth:depth|0,score:NaN,nodes:w.get_nodes()>>>0,time:performance.now()-start,engine:'wasm64'};
    WASM_FAILED=true;return null;
  }
  return{ok:true,depth:depth|0,score:w.get_level(depth|0),nodes:w.get_nodes()>>>0,time:performance.now()-start,engine:'wasm64'};
}
async function wasmRiskAll(board,horizon,nodeLimit){
  const w=await SURVIVAL_READY;if(!w)return null;const p=pack4(board);if(!p)return null;const start=performance.now();
  try{const code=w.analyze_survival(p[0],p[1],horizon|0,nodeLimit>>>0),aborted=w.get_aborted?!!w.get_aborted():code<0,dirs=['up','left','right','down'],survivals={};for(let i=0;i<4;i++)survivals[dirs[i]]=w.get_survival(i);return{ok:!aborted,best:code>=0?dirs[code]:null,survivals,nodes:w.get_nodes()>>>0,time:performance.now()-start,engine:'survival-v9.1'}}catch(e){return null}
}
// One-sided certificate: true means the chosen root survives every spawn for H.
// The internal three-state result distinguishes a counterexample from unfinished work.
// Neither a counterexample nor unknown is a death prediction or a move score.
function createSafetyProof(){
  const left=new Uint16Array(65536),known=new Uint8Array(65536);
  const keysLo=new Uint32Array(16384),keysHi=new Uint32Array(16384),heights=new Uint8Array(16384),failures=new Uint8Array(16384);
  const spawnLo=new Uint32Array(8192),spawnHi=new Uint32Array(8192),spawnHeights=new Uint8Array(8192),spawnFailures=new Uint8Array(8192);
  const movesLo=new Uint32Array(32),movesHi=new Uint32Array(32),spaces=new Int8Array(32);
  let outLo=0,outHi=0,nodes=0,limit=0,deadline=0,expired=false,wideMove=false;
  function row(x){
    if(known[x]){if(known[x]===2)wideMove=true;return left[x];}
    let out=0,shift=0,previous=0,wide=false;
    for(let i=0;i<16;i+=4){const v=(x>>>i)&15;if(!v)continue;
      if(v===previous){if(v===15)wide=true;out|=Math.min(15,v+1)<<shift;shift+=4;previous=0;}
      else {if(previous){out|=previous<<shift;shift+=4;}previous=v;}
    }
    if(previous)out|=previous<<shift;known[x]=wide?2:1;if(wide)wideMove=true;return left[x]=out;
  }
  const reverse=x=>((x&15)<<12)|((x&240)<<4)|((x&3840)>>>4)|(x>>>12);
  function move(lo,hi,d){
    wideMove=false;
    // Columns become rows for vertical moves; all shifts stay inside 32 bits.
    const vertical=d===0||d===3;
    if(vertical){
      const a=lo&65535,b=lo>>>16,c=hi&65535,e=hi>>>16;
      lo=((a&15)|((b&15)<<4)|((c&15)<<8)|((e&15)<<12)|
        ((a&240)<<12)|((b&240)<<16)|((c&240)<<20)|((e&240)<<24))>>>0;
      hi=(((a>>>8)&15)|((b>>>4)&240)|(c&3840)|((e<<4)&61440)|
        ((a&61440)<<4)|((b&61440)<<8)|((c&61440)<<12)|((e&61440)<<16))>>>0;
    }
    const right=d===2||d===3;
    let a=lo&65535,b=lo>>>16,c=hi&65535,e=hi>>>16;
    if(right){a=reverse(row(reverse(a)));b=reverse(row(reverse(b)));c=reverse(row(reverse(c)));e=reverse(row(reverse(e)));}
    else {a=row(a);b=row(b);c=row(c);e=row(e);}
    if(vertical){
      outLo=((a&15)|((b&15)<<4)|((c&15)<<8)|((e&15)<<12)|
        ((a&240)<<12)|((b&240)<<16)|((c&240)<<20)|((e&240)<<24))>>>0;
      outHi=(((a>>>8)&15)|((b>>>4)&240)|(c&3840)|((e<<4)&61440)|
        ((a&61440)<<4)|((b&61440)<<8)|((c&61440)<<12)|((e&61440)<<16))>>>0;
    }else {outLo=(a|(b<<16))>>>0;outHi=(c|(e<<16))>>>0;}
  }
  function emptyBits(x){x|=x>>>2;x|=x>>>1;return (~x)&0x11111111;}
  function zeroNibbles(x){x|=x>>>2;x|=x>>>1;x=(~x)&0x11111111;x+=x>>>16;x+=x>>>8;x+=x>>>4;return x&15;}
  function empties(lo,hi){return zeroNibbles(lo)+zeroNibbles(hi);}
  // Only resolved facts are stored. Unknown is -1 and must never enter this table.
  function remember(lo,hi,h,index,value){
    if(keysLo[index]!==lo||keysHi[index]!==hi){keysLo[index]=lo;keysHi[index]=hi;heights[index]=0;failures[index]=0;}
    if(value===1)heights[index]=Math.max(heights[index],h+1);
    else failures[index]=failures[index]?Math.min(failures[index],h+1):h+1;
    return value;
  }
  function spawnFact(lo,hi,h,index,value){
    if(spawnLo[index]!==lo||spawnHi[index]!==hi){spawnLo[index]=lo;spawnHi[index]=hi;spawnHeights[index]=0;spawnFailures[index]=0;}
    if(value===1)spawnHeights[index]=Math.max(spawnHeights[index],h+1);
    else spawnFailures[index]=spawnFailures[index]?Math.min(spawnFailures[index],h+1):h+1;
    return value;
  }
  function allSpawns(lo,hi,h){
    if(expired||nodes>=limit)return -1;
    const index=(Math.imul(lo^lo>>>16,0x45d9f3b)^Math.imul(hi^hi>>>16,0x119de1f3))&8191;
    if(spawnLo[index]===lo&&spawnHi[index]===hi){
      if(spawnHeights[index]>h)return 1;
      if(spawnFailures[index]&&spawnFailures[index]<=h+1)return 0;
    }
    // Set bits identify empty nibbles. Visiting low bits first preserves V9.4's
    // exact square order and 4-before-2 order while skipping occupied squares.
    let mask=emptyBits(lo);
    while(mask){
      const bit=mask&-mask;mask^=bit;
      let result=prove((lo|(bit<<1))>>>0,hi,h);
      if(result!==1)return result===0?spawnFact(lo,hi,h,index,0):-1;
      result=prove((lo|bit)>>>0,hi,h);
      if(result!==1)return result===0?spawnFact(lo,hi,h,index,0):-1;
    }
    mask=emptyBits(hi);
    while(mask){
      const bit=mask&-mask;mask^=bit;
      let result=prove(lo,(hi|(bit<<1))>>>0,h);
      if(result!==1)return result===0?spawnFact(lo,hi,h,index,0):-1;
      result=prove(lo,(hi|bit)>>>0,h);
      if(result!==1)return result===0?spawnFact(lo,hi,h,index,0):-1;
    }
    return spawnFact(lo,hi,h,index,1);
  }
  function prove(lo,hi,h){
    if(expired||nodes>=limit)return -1;
    nodes++;
    if(deadline&&!(nodes&31)&&performance.now()>=deadline){expired=true;return -1;}
    const e=empties(lo,hi);if((lo||hi)&&e>h)return 1;
    const index=(Math.imul(lo^lo>>>16,0x45d9f3b)^Math.imul(hi^hi>>>16,0x119de1f3))&16383;
    if(keysLo[index]===lo&&keysHi[index]===hi){
      if(heights[index]>h)return 1;
      // Failure of certainty at h also rules out certainty at any longer horizon.
      if(failures[index]&&failures[index]<=h+1)return 0;
    }
    const offset=h*4;let unknown=false;
    for(let d=0;d<4;d++){
      move(lo,hi,d);const i=offset+d;spaces[i]=-1;
      if(outLo!==lo||outHi!==hi){
        if(h<=0)return 1;
        // Overflow actions are unknown, never evidence of unavoidable failure.
        if(wideMove){unknown=true;continue;}
        const n=empties(outLo,outHi);if(n>h)return remember(lo,hi,h,index,1);
        movesLo[i]=outLo;movesHi[i]=outHi;spaces[i]=n;
      }
    }
    for(let k=0;k<4;k++){
      let pick=-1,best=-1;for(let d=0;d<4;d++)if(spaces[offset+d]>best){pick=offset+d;best=spaces[pick];}
      if(pick<0)break;spaces[pick]=-1;
      const result=allSpawns(movesLo[pick],movesHi[pick],h-1);
      if(result===1)return remember(lo,hi,h,index,1);
      if(result===-1)unknown=true;
      if(expired||nodes>=limit)return -1;
    }
    return unknown?-1:remember(lo,hi,h,index,0);
  }
  function certify(lo,hi,dir,h,maxNodes=512,maxMs=.5){
    const start=performance.now();nodes=0;limit=maxNodes;deadline=maxMs?start+maxMs:0;expired=false;
    if(!Number.isInteger(h)||h<1||h>7||!Number.isInteger(dir)||dir<0||dir>3)return {certified:false,status:'unknown',nodes:0,time:0,exhausted:false};
    move(lo,hi,dir);const a=outLo,b=outHi;
    const result=wideMove||a===lo&&b===hi?-1:allSpawns(a,b,h-1);
    return {certified:result===1,status:result===1?'safe':result===0?'not-certain':'unknown',nodes,time:performance.now()-start,exhausted:expired||nodes>=limit};
  }
  return {certify,empties,move(lo,hi,d){move(lo,hi,d);return [outLo,outHi];},row,clearFacts(){heights.fill(0);failures.fill(0);spawnHeights.fill(0);spawnFailures.fill(0);}};
}

let SAFETY=null,SAFETY_FAILED=false;
function getSafety(){return SAFETY_FAILED?null:SAFETY||(SAFETY=createSafetyProof());}
let COUNTERFACTUAL_PROOF=null;
function getCounterfactualProof(){const p=COUNTERFACTUAL_PROOF||(COUNTERFACTUAL_PROOF=createSafetyProof());p.clearFacts();return p;}

let LEGACY=null;
function getLegacy(){return LEGACY||(LEGACY=createLegacy());}
function createLegacy(){
'use strict';
const DIRS=['up','left','right','down'];
const LINESETS={
  left:[[0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15]],
  right:[[3,2,1,0],[7,6,5,4],[11,10,9,8],[15,14,13,12]],
  up:[[0,4,8,12],[1,5,9,13],[2,6,10,14],[3,7,11,15]],
  down:[[12,8,4,0],[13,9,5,1],[14,10,6,2],[15,11,7,3]]
};
const ROW_OUT=new Uint32Array(1<<20), ROW_GAIN=new Float64Array(1<<20);
let DEADLINE=0,NODES=0,CFG=null,EPOCH=1,TT=null,TTMASK=0;
function ensureTT(bits){
  const size=1<<bits;
  if(TT&&TT.size===size)return;
  TT={size,k1:new Uint32Array(size),k2:new Uint32Array(size),epoch:new Uint16Array(size),val:new Float64Array(size)};
  TTMASK=size-1;EPOCH=1;
}
function clearTT(){if(!TT)return;EPOCH=(EPOCH+1)&65535;if(EPOCH===0){TT.epoch.fill(0);EPOCH=1}}
function rowMoveCode(code){
  let packed=ROW_OUT[code];if(packed)return packed-1;
  const a=code&31,b=(code>>>5)&31,c=(code>>>10)&31,d=(code>>>15)&31;
  const src=[a,b,c,d],v=[];for(let i=0;i<4;i++)if(src[i])v.push(src[i]);
  const out=[];let gain=0;
  for(let i=0;i<v.length;i++){
    if(i+1<v.length&&v[i]===v[i+1]){const r=Math.min(31,v[i]+1);out.push(r);gain+=2**r;i++}else out.push(v[i]);
  }
  while(out.length<4)out.push(0);
  const outCode=(out[0]|(out[1]<<5)|(out[2]<<10)|(out[3]<<15))>>>0;
  ROW_OUT[code]=outCode+1;ROW_GAIN[code]=gain;return outCode;
}
function rowMove(code){const out=rowMoveCode(code);return [out,ROW_GAIN[code]];}
function moveBoard(board,dir){
  const out=new Uint8Array(16),lines=LINESETS[dir];let moved=false,gain=0,wideArithmetic=false;
  // Decide representability per line. A rank-31 tile must not send the other
  // three lines through allocating map/filter movers. Scoring uses real ranks.
  for(let k=0;k<4;k++){
    const ids=lines[k],a=board[ids[0]],b=board[ids[1]],c=board[ids[2]],d=board[ids[3]];
    // Preserve the original per-merge addition order after extremely large
    // ranks: grouping two small rewards could otherwise round differently.
    if(a>=49||b>=49||c>=49||d>=49)wideArithmetic=true;
    if(!wideArithmetic&&a<31&&b<31&&c<31&&d<31){
      const code=(a|(b<<5)|(c<<10)|(d<<15))>>>0,oc=rowMoveCode(code);gain+=ROW_GAIN[code];
      const v0=oc&31,v1=(oc>>>5)&31,v2=(oc>>>10)&31,v3=(oc>>>15)&31;
      out[ids[0]]=v0;out[ids[1]]=v1;out[ids[2]]=v2;out[ids[3]]=v3;
      if(v0!==a||v1!==b||v2!==c||v3!==d)moved=true;
    }else{
      // Streaming compaction: a pending tile is emitted or merged exactly
      // once, in the same order as the original unsaturated numeric mover.
      let pending=0,slot=0;
      for(let j=0;j<4;j++){
        const r=board[ids[j]];if(!r)continue;
        if(!pending){pending=r;continue;}
        if(pending===r){out[ids[slot++]]=r+1;gain+=2**(r+1);pending=0;}
        else{out[ids[slot++]]=pending;pending=r;}
      }
      if(pending)out[ids[slot]]=pending;
      if(out[ids[0]]!==a||out[ids[1]]!==b||out[ids[2]]!==c||out[ids[3]]!==d)moved=true;
    }
  }
  return [out,moved,gain];
}
function legalMoves(board){const out=[];for(const d of DIRS){const m=moveBoard(board,d);if(m[1])out.push([d,m[0],m[2]])}return out}
function toRanks(board){const a=new Uint8Array(16);for(let i=0;i<16;i++)a[i]=board[i]?Math.log2(board[i]):0;return a}
const SNAKES=[
  [15,14,13,12,8,9,10,11,7,6,5,4,0,1,2,3],[12,13,14,15,11,10,9,8,4,5,6,7,3,2,1,0],
  [3,2,1,0,4,5,6,7,11,10,9,8,12,13,14,15],[0,1,2,3,7,6,5,4,8,9,10,11,15,14,13,12],
  [15,11,7,3,2,6,10,14,13,9,5,1,0,4,8,12],[12,8,4,0,1,5,9,13,14,10,6,2,3,7,11,15],
  [3,7,11,15,14,10,6,2,1,5,9,13,12,8,4,0],[0,4,8,12,13,9,5,1,2,6,10,14,15,11,7,3]
];
const SW=SNAKES.map(()=>{const w=new Float64Array(16);let x=1;for(let i=0;i<16;i++){w[i]=x;x*=1.38}return w});
// Exact leaf memo: four complete 32-bit words, NOT a probabilistic fingerprint.
// The evaluator depends only on ranks, so these entries can survive TT epochs.
// Keep NODES/deadline checks on hits too: budgets retain the original semantics.
const LEAF_SIZE=8192, LEAF_MASK=LEAF_SIZE-1;
const LEAF_KEYS=new Uint32Array(LEAF_SIZE*4),LEAF_VALUES=new Float64Array(LEAF_SIZE),LEAF_USED=new Uint8Array(LEAF_SIZE);
let LEAF_HITS=0,LEAF_MISSES=0;
function evaluate(a){
  NODES++;if((NODES&2047)===0&&performance.now()>DEADLINE)throw 1;
  const k0=(a[0]|a[1]<<8|a[2]<<16|a[3]<<24)>>>0,k1=(a[4]|a[5]<<8|a[6]<<16|a[7]<<24)>>>0;
  const k2=(a[8]|a[9]<<8|a[10]<<16|a[11]<<24)>>>0,k3=(a[12]|a[13]<<8|a[14]<<16|a[15]<<24)>>>0;
  let hash=Math.imul(k0^Math.imul(k1,0x9e3779b1)^Math.imul(k2,0x85ebca6b)^Math.imul(k3,0xc2b2ae35),0x27d4eb2d);
  const slot=(hash^(hash>>>16))&LEAF_MASK,i=slot*4;
  if(LEAF_USED[slot]&&LEAF_KEYS[i]===k0&&LEAF_KEYS[i+1]===k1&&LEAF_KEYS[i+2]===k2&&LEAF_KEYS[i+3]===k3){LEAF_HITS++;return LEAF_VALUES[slot];}
  LEAF_MISSES++;const value=evaluateUncached(a);
  LEAF_KEYS[i]=k0;LEAF_KEYS[i+1]=k1;LEAF_KEYS[i+2]=k2;LEAF_KEYS[i+3]=k3;LEAF_VALUES[slot]=value;LEAF_USED[slot]=1;
  return value;
}
function evaluateUncached(a){
  let empties=0,maxR=0,maxI=0,merge=0,smooth=0,islands=0;
  for(let i=0;i<16;i++){const v=a[i];if(!v){empties++;continue}if(v>maxR){maxR=v;maxI=i}}
  for(let r=0;r<4;r++)for(let c=0;c<4;c++){
    const i=r*4+c,v=a[i];if(!v)continue;let near=0;
    if(c<3&&a[i+1]){smooth-=Math.abs(v-a[i+1]);near++;if(v===a[i+1])merge+=1+v*.12}
    if(c>0&&a[i-1])near++;
    if(r<3&&a[i+4]){smooth-=Math.abs(v-a[i+4]);near++;if(v===a[i+4])merge+=1+v*.12}
    if(r>0&&a[i-4])near++;
    if(near===4&&v<=3)islands++;
  }
  let mono=0;
  for(let r=0;r<4;r++){const o=r*4;let up=0,down=0;for(let c=0;c<3;c++){const d=a[o+c]-a[o+c+1];if(d>0)down+=d;else up-=d}mono-=Math.min(up,down)}
  for(let c=0;c<4;c++){let up=0,down=0;for(let r=0;r<3;r++){const d=a[r*4+c]-a[(r+1)*4+c];if(d>0)down+=d;else up-=d}mono-=Math.min(up,down)}
  let snakeBest=-1e18;
  for(let s=0;s<8;s++){const order=SNAKES[s],w=SW[s];let x=0;for(let p=0;p<16;p++)x+=a[order[p]]*w[p];if(x>snakeBest)snakeBest=x}
  let corner=false,edge=false;for(let i=0;i<16;i++)if(a[i]===maxR){corner ||= i===0||i===3||i===12||i===15;edge ||= i<4||i>11||i%4===0||i%4===3;}
  const late=empties<=4,critical=empties<=2;
  let score=empties*(late?3000:2050)+mono*(late?330:270)+smooth*52+merge*520+snakeBest*(late?1.42:1.08)-islands*180;
  score+=maxR*(corner?(late?1550:1180):edge?280:-360);if(critical)score+=empties*1600;return score;
}
function probClass(p){return p>.08?0:p>.018?1:p>.004?2:3}
let PROBE_K1=0,PROBE_K2=0;
function hash(board,meta){
  let h1=(0x811c9dc5^meta)>>>0,h2=(0x9e3779b9+Math.imul(meta,0x85ebca6b))>>>0;
  for(let i=0;i<16;i++){const x=board[i]+i*37;h1=Math.imul(h1^x,0x01000193)>>>0;h2=Math.imul(h2^(x+0x9e37),0x27d4eb2d)>>>0}
  h1^=h1>>>16;h2^=h2>>>15;PROBE_K2=h2>>>0;return h1>>>0;
}
// Probe once. Callers snapshot both keys before descending recursively.
// Reusing these exact keys on insert removes a second 16-cell hash pass
// without changing slots, collision checks, epochs or replacement order.
function cacheGet(board,type,depth,pathP){
  if(depth<CFG.cacheMinDepth)return NaN;
  const meta=(depth&31)|((type&1)<<5)|(probClass(pathP)<<6)|((CFG.phase||0)<<8);
  const k1=PROBE_K1=hash(board,meta),i=k1&TTMASK;
  return TT.epoch[i]===EPOCH&&TT.k1[i]===k1&&TT.k2[i]===PROBE_K2?TT.val[i]:NaN;
}
function cachePut(depth,k1,k2,v){
  if(depth<CFG.cacheMinDepth)return v;
  const i=k1&TTMASK;TT.k1[i]=k1;TT.k2[i]=k2;TT.val[i]=v;TT.epoch[i]=EPOCH;return v;
}
function collectEmpties(board){const e=[];for(let i=0;i<16;i++)if(board[i]===0)e.push(i);return e}
function sampledEmpties(e,cap,ply){if(e.length<=cap)return e;const out=[],step=e.length/cap,offset=((ply*0.61803398875)%1);for(let k=0;k<cap;k++)out.push(e[Math.floor((k+offset)*step)%e.length]);return out}
function hasMove(a){for(let i=0;i<16;i++){if(!a[i])return true;if((i&3)<3&&a[i]===a[i+1])return true;if(i<12&&a[i]===a[i+4])return true;}return false;}
function maxNode(board,depth,pathP,ply){
  if(!hasMove(board))return -1e15;
  if(depth<=0||pathP<CFG.probCut)return evaluate(board);
  const hit=cacheGet(board,0,depth,pathP);if(hit===hit)return hit;
  const k1=PROBE_K1,k2=PROBE_K2;
  let best=-1e18;
  for(const dir of DIRS){const m=moveBoard(board,dir);if(!m[1])continue;const v=m[2]*2.55+chanceNode(m[0],depth-1,pathP,ply);if(v>best)best=v;}
  if(best===-1e18)return -1e15;
  return cachePut(depth,k1,k2,best);
}
function chanceNode(board,depth,pathP,ply){
  const hit=cacheGet(board,1,depth,pathP);if(hit===hit)return hit;
  const k1=PROBE_K1,k2=PROBE_K2;
  const all=collectEmpties(board);if(!all.length)return maxNode(board,depth,pathP,ply+1);
  const exact=ply<CFG.exactPlies||all.length<=CFG.exactWhenEmpty;
  const cap=Math.max(2,CFG.sampleCap-(ply>2?1:0)-(ply>4?1:0));
  const empt=exact?all:sampledEmpties(all,cap,ply);let sum=0;
  const inv=1/all.length;
  for(let j=0;j<empt.length;j++){
    // Each recursive call owns its move output. Restore even when a deadline
    // throws, and retain spawn order and floating-point addition order exactly.
    const p=empt[j];
    try{board[p]=1;const s2=maxNode(board,depth,pathP*.9*inv,ply+1);
      board[p]=2;sum+=.9*s2+.1*maxNode(board,depth,pathP*.1*inv,ply+1);
    }finally{board[p]=0;}
  }
  const v=sum/empt.length;return cachePut(depth,k1,k2,v);
}
function begin(cfg){CFG=cfg;ensureTT(cfg.ttBits);DEADLINE=performance.now()+cfg.budget;NODES=0;LEAF_HITS=0;LEAF_MISSES=0;}
function analyze(board,cfg){
  begin(cfg);const root=toRanks(board),legal=legalMoves(root),start=performance.now();if(!legal.length)return{best:null,depth:0,nodes:0,scores:{},time:0};
  let scores={},best=legal[0][0],doneDepth=0;
  for(const m of legal)scores[m[0]]=evaluate(m[1])+m[2]*2.55;
  for(let depth=1;depth<=cfg.maxDepth;depth++){
    const next={};try{for(const m of legal){if(performance.now()>DEADLINE)throw 1;next[m[0]]=m[2]*2.55+chanceNode(m[1],depth-1,1,0)}}catch(_){break}
    scores=next;doneDepth=depth;best=Object.entries(scores).reduce((a,b)=>b[1]>a[1]?b:a)[0];if(performance.now()>DEADLINE)break;
  }
  best=Object.entries(scores).reduce((a,b)=>b[1]>a[1]?b:a)[0];return{best,depth:doneDepth,nodes:NODES,scores,time:performance.now()-start};
}
function analyzeRoot(board,gain,cfg){
  begin(cfg);const root=toRanks(board),start=performance.now(),levels=[evaluate(root)+gain*2.55];let doneDepth=0;
  for(let depth=1;depth<=cfg.maxDepth;depth++){
    try{if(performance.now()>DEADLINE)throw 1;levels[depth]=gain*2.55+chanceNode(root,depth-1,1,0)}catch(_){break}
    doneDepth=depth;if(performance.now()>DEADLINE)break;
  }
  return{depth:doneDepth,levels,nodes:NODES,time:performance.now()-start};
}
function analyzeExact(board,gain,depth,cfg,hardBudget){
  begin({...cfg,budget:hardBudget>0?hardBudget:cfg.fallbackBudget});clearTT();
  const root=toRanks(board),start=performance.now();
  try{
    const score=gain*2.55+chanceNode(root,depth-1,1,0);
    return {ok:true,depth,score,nodes:NODES,time:performance.now()-start,engine:'js-v9.3',leafHits:LEAF_HITS,leafMisses:LEAF_MISSES};
  }catch(e){if(e!==1)throw e;return {ok:false,depth,score:NaN,nodes:NODES,time:performance.now()-start,engine:'js-v9.3',leafHits:LEAF_HITS,leafMisses:LEAF_MISSES};}
}
return {analyze,analyzeRoot,analyzeExact,clearTT};
}

let resultPort=null;
// COUNTERFACTUAL_SOURCE_START
// V11.8: complete, paired counterfactual continuations. No access to game RNG.
'use strict';
const Counterfactual2048=(()=>{
  const DIRS=['up','left','right','down'];
  const LINES={up:[[0,4,8,12],[1,5,9,13],[2,6,10,14],[3,7,11,15]],
    left:[[0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15]],
    right:[[3,2,1,0],[7,6,5,4],[11,10,9,8],[15,14,13,12]],
    down:[[12,8,4,0],[13,9,5,1],[14,10,6,2],[15,11,7,3]]};
  const SETTINGS=Object.freeze({horizon:96,samples:16,policyDepth:2,maxValueGap:.003,minMeanGain:1,minTailGain:1});
  function mix(x){x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);return (x^(x>>>16))>>>0;}
  function seed(board){let x=0x1182048;for(let i=0;i<16;i++)x=mix(x^mix(board[i]+Math.imul(i+1,0x9e3779b9)));return x;}
  function uniform(s,path,step,kind){return mix(s^Math.imul(path+1,0x9e3779b9)^Math.imul(step+1,0x85ebca6b)^Math.imul(kind+1,0xc2b2ae35))/4294967296;}
  function ranks(board,horizon,depth){
    if(!Array.isArray(board)||board.length!==16||!Number.isInteger(horizon)||horizon<1||horizon>128||!Number.isInteger(depth)||depth<2||depth>3)return null;
    let mass=0;const out=new Uint8Array(16);
    for(let i=0;i<16;i++){const v=board[i];if(v!==0&&!(Number.isInteger(v)&&v>=2&&v<=32768&&(v&(v-1))===0))return null;mass+=v;out[i]=v?31-Math.clz32(v):0;}
    // Covers EVERY simulated birth and EVERY continuation value-core horizon.
    // Rank-15 merges can never overflow under this strict total-mass bound.
    return mass+4*(horizon+depth)<65536?out:null;
  }
  function move(src,dir){
    const dst=new Uint8Array(16),line=new Uint8Array(4);let gain=0;
    for(const ids of LINES[dir]){let n=0,k=0;for(let i=0;i<4;i++)if(src[ids[i]])line[n++]=src[ids[i]];
      for(let i=0;i<n;i++){let r=line[i];if(i+1<n&&r===line[i+1]){r++;gain+=2**r;i++;}dst[ids[k++]]=r;}}
    for(let i=0;i<16;i++)if(src[i]!==dst[i])return {board:dst,gain};return null;
  }
  function words(board){let lo=0,hi=0;for(let i=0;i<16;i++){if(board[i]>15)throw new RangeError('Unrepresentable simulation tile');if(i<8)lo|=board[i]<<(4*i);else hi|=board[i]<<(4*(i-8));}return [lo>>>0,hi>>>0];}
  function stats(lives){const sorted=Array.from(lives).sort((a,b)=>a-b),n=lives.length,k=Math.max(1,Math.ceil(n/4));return {mean:sorted.reduce((a,b)=>a+b,0)/n,tail:sorted.slice(0,k).reduce((a,b)=>a+b,0)/k,deaths:sorted.filter(x=>x<SETTINGS.horizon).length};}
  function run(board,options,score){
    const {horizon,samples,policyDepth}=options;
    const start=ranks(board,horizon,policyDepth);
    if(!start||!Number.isInteger(samples)||samples<8||samples>64||samples%2||!Number.isInteger(options.seed)||options.seed<0||options.seed>0xffffffff)return {ok:false,lives:null,reason:'invalid or uncertified simulation input'};
    const lives=[],merges=[],minSpaces=[],terminalScores=[],endpoints=[];let searches=0;
    try{
      for(let p=0;p<samples;p++){
        let b=start.slice(),life=horizon,merged=0,minSpace=16,lastScore=0,endpoint=null;
        for(let step=0;step<horizon;step++){
          const empty=[];for(let i=0;i<16;i++)if(!b[i])empty.push(i);
          if(!empty.length)throw new Error('No birth cell in a legal afterstate');
          b[empty[Math.floor(uniform(options.seed,p,step,0)*empty.length)]]=uniform(options.seed,p,step,1)<.9?1:2;
          minSpace=Math.min(minSpace,empty.length-1);
          let best=null,bestValue=-Infinity;
          // Complete same-depth comparison of ALL legal continuation actions.
          for(const d of DIRS){const m=move(b,d);if(!m)continue;const value=score(words(m.board),policyDepth);searches++;
            if(!Number.isFinite(value))throw new Error('Incomplete continuation score');
            if(value>bestValue||(value===bestValue&&m.gain>(best?.gain||0))){best=m;bestValue=value;}}
          if(options.captureEndpoints&&(step===horizon-1||!best))endpoint={board:Array.from(b,r=>r?2**r:0),terminal:!best};
          if(!best){life=step+1;break;}
          b=best.board;merged+=best.gain;lastScore=bestValue;
        }
        lives.push(life);merges.push(merged);minSpaces.push(minSpace);terminalScores.push(lastScore);if(options.captureEndpoints)endpoints.push(endpoint);
      }
      return {ok:true,lives,merges,minSpaces,terminalScores,searches,horizon,samples,policyDepth,seed:options.seed,...(options.captureEndpoints?{endpoints}:{})};
    }catch(error){return {ok:false,lives:null,searches,reason:String(error.message||error)};}
  }
  function improve(a,b,tailGuard){
    const x=stats(a),y=stats(b),diff=a.map((v,i)=>v-b[i]),mean=diff.reduce((s,v)=>s+v,0)/diff.length;
    const variance=diff.reduce((s,v)=>s+(v-mean)**2,0)/Math.max(1,diff.length-1),se=Math.sqrt(variance/diff.length);
    return {passed:mean>=SETTINGS.minMeanGain&&mean>=1.5*se&&x.deaths<=y.deaths&&(!tailGuard||x.tail-y.tail>=SETTINGS.minTailGain),meanGain:mean,tailGain:x.tail-y.tail,pairedSE:se,alternative:x,baseline:y};
  }
  function choose(results,baseline,scores,{confirmation=true,tailGuard=true,allowed=null}={}){
    const dirs=DIRS.filter(d=>Object.hasOwn(scores,d)),valid=dirs.length>=2&&dirs.includes(baseline)&&dirs.every(d=>Number.isFinite(scores[d])&&results[d]?.ok&&results[d].horizon===SETTINGS.horizon&&results[d].samples===SETTINGS.samples&&results[d].lives?.length===SETTINGS.samples&&results[d].lives.every(x=>Number.isInteger(x)&&x>=1&&x<=SETTINGS.horizon));
    if(!valid)return {best:baseline,changed:false,complete:false,reason:'discarded incomplete planning round'};
    const reference=results[baseline].lives,half=SETTINGS.samples/2,den=Math.max(1,Math.abs(scores[baseline]));
    const candidates=[],evidence={};
    for(const d of dirs){if(d===baseline||(allowed&&!allowed.includes(d))||(scores[baseline]-scores[d])/den>SETTINGS.maxValueGap)continue;
      const a=results[d].lives,b=reference;
      const explore=improve(a.slice(0,half),b.slice(0,half),tailGuard),confirm=improve(a.slice(half),b.slice(half),tailGuard);
      evidence[d]={explore,confirm};if(explore.passed&&(!confirmation||confirm.passed))candidates.push(d);}
    candidates.sort((a,b)=>stats(results[b].lives).tail-stats(results[a].lives).tail||stats(results[b].lives).mean-stats(results[a].lives).mean||DIRS.indexOf(a)-DIRS.indexOf(b));
    const best=candidates[0]||baseline;return {best,changed:best!==baseline,complete:true,confirmed:best!==baseline&&confirmation,evidence,baseline,summary:Object.fromEntries(dirs.map(d=>[d,stats(results[d].lives)]))};
  }
  function strongEscape(results,baseline,alternative){
    const dirs=[baseline,alternative],n=SETTINGS.samples/2,H=SETTINGS.horizon;
    const complete=baseline!==alternative&&dirs.every(d=>results[d]?.ok&&results[d].horizon===H&&results[d].samples===n*2&&results[d].lives?.length===n*2&&results[d].lives.every(x=>Number.isInteger(x)&&x>=1&&x<=H));
    if(!complete)return {complete:false,passed:false};
    const banks=[];for(let bank=0;bank<2;bank++){
      const a=results[alternative].lives.slice(bank*n,bank*n+n),b=results[baseline].lives.slice(bank*n,bank*n+n),e=improve(a,b,true),diff=a.map((v,i)=>v-b[i]);
      const sum=diff.reduce((s,v)=>s+v,0),worst=Math.min(...diff),passed=e.passed&&sum>=H&&e.tailGain>=H/n&&worst>=-H/n&&e.alternative.deaths<e.baseline.deaths;
      banks.push({...e,totalLifeGain:sum,worstPairedGain:worst,passed});
    }
    return {complete:true,passed:banks.every(b=>b.passed),banks,rule:'both banks gain at least one horizon in total, improve low tail by H/bank size, reduce sampled deaths and bound every paired loss by H/bank size'};
  }
  return {SETTINGS,DIRS,seed,uniform,ranks,move,words,stats,run,choose,strongEscape};
})();
if(typeof module!=='undefined')module.exports=Counterfactual2048;

// COUNTERFACTUAL_SOURCE_END
const reply=r=>resultPort?resultPort.postMessage(r):postMessage(r);
async function handle(e){
  const m=e.data;
  try{
    if(m.type==='connect'){
      resultPort=m.port;resultPort.onmessage=handle;
      await Promise.all([WASM_READY,SURVIVAL_READY,V102_READY]);reply({type:'ready',wasm:!!WASM,v102:!!V102_WASM});return;
    }
    if(m.type==='clear'){if(WASM)WASM.clear_tt();if(LEGACY)LEGACY.clearTT();return;}
    if(m.type==='v102'){
      const r=await v102Exact(m.board,m.depth||3,(m.lo!==undefined||m.hi!==undefined)?[m.lo,m.hi]:null);
      if(!r){reply({id:m.id,round:m.round,dir:m.dir,ok:false,depth:m.depth||3,score:NaN,nodes:0,time:0,engine:'v10.3-unavailable'});return;}
      reply({id:m.id,round:m.round,dir:m.dir,...r});return;
    }
    if(m.type==='candidate-proof'){
      const started=performance.now(),p=pack4(m.board);
      let proof={certified:false,status:'unknown',nodes:0};
      if(p)proof=getCounterfactualProof().certify(p[0],p[1],['up','left','right','down'].indexOf(m.dir),m.horizon,m.nodeLimit||4096,0);
      reply({id:m.id,round:m.round,dir:m.dir,...proof,time:performance.now()-started});return;
    }
    if(m.type==='counterfactual'){
      const started=performance.now(),w=await V102_READY;
      let nodes=0,simulationCacheHits=0;const memo=m.options?.memo===false?null:new Map();
      const r=w?Counterfactual2048.run(m.board,m.options,(words,depth)=>{
        const key=memo?words[0]+':'+words[1]+':'+depth:null;
        if(memo?.has(key)){simulationCacheHits++;return memo.get(key);}
        const score=w.v102_score_depth(words[0],words[1],depth);nodes+=w.v102_nodes()>>>0;
        if(memo&&memo.size<16384&&Number.isFinite(score))memo.set(key,score);return score;
      }):{ok:false,lives:null,reason:'value WASM unavailable'};
      let shortCertified=false,shortProofNodes=0;
      if(r.ok&&m.proofH){const p=pack4(m.rootBoard);if(p){try{const proof=getCounterfactualProof().certify(p[0],p[1],['up','left','right','down'].indexOf(m.dir),m.proofH,4096,0);shortCertified=!!proof?.certified;shortProofNodes=proof?.nodes||0;}catch{shortCertified=false;}}}
      reply({id:m.id,round:m.round,dir:m.dir,...r,simulationCacheHits,shortCertified,shortProofNodes,nodes:nodes+shortProofNodes,time:performance.now()-started});return;
    }
    if(m.type==='exact'){
      let r=await wasmExact(m.board,m.gain,m.depth,m.cfg,m.hardBudget||0);
      if(!r)r=getLegacy().analyzeExact(m.board,m.gain,m.depth,m.cfg,m.hardBudget||0);
      reply({id:m.id,round:m.round,dir:m.dir,...r});return;
    }
    if(m.type==='riskall'){
      const start=performance.now(),dirs=['up','left','right','down'],d=dirs.indexOf(m.baseline);
      let proof=null;const packed=d>=0&&m.minGap>1e-6&&m.horizon>=1&&m.horizon<=7?pack4(m.board):null;
      // A certainty certificate implies every alternative's survival advantage
      // is below the existing gate. Unknown/timeout always uses the old engine.
      if(packed){try{proof=getSafety()?.certify(packed[0],packed[1],d,m.horizon,m.proofNodes||4096,m.proofMs||.75);}catch{SAFETY_FAILED=true;SAFETY=null;}}
      const r=proof?.certified?{ok:true,best:m.baseline,survivals:{[m.baseline]:1},nodes:0,engine:'survival-certificate-v10'}:
        await wasmRiskAll(m.board,m.horizon,m.nodeLimit)||{ok:false,best:null,survivals:{},nodes:0,time:0,engine:'risk-unavailable'};
      reply({id:m.id,round:m.round,...r,nodes:r.nodes+(proof?.nodes||0),time:performance.now()-start,
        proofCertified:!!proof?.certified,proofNodes:proof?.nodes||0,proofMs:proof?.time||0});return;
    }
  }catch(error){reply({id:m.id,round:m.round,dir:m.dir,error:String(error.message||error)});}
}
onmessage=handle;
