// GENERADO — no editar a mano.
// Fuente: docs/legal/*.md · Generador: scripts/generar-legales.js
// Regenerar: npm run legales
// Cualquier cambio hecho acá se pierde en la próxima corrida.
//
// Este módulo es la Política de privacidad y los Términos de uso convertidos
// a datos, para que src/screens/LegalScreen.tsx los pinte con los componentes
// de src/ui. La pantalla no tiene texto legal propio: si un abogado corrige el
// markdown, la app cambia con él.

export interface TramoLegal {
  texto: string;
  fuerte?: boolean;
  enfasis?: boolean;
  codigo?: boolean;
  enlace?: string;
}

export type BloqueLegal =
  | { tipo: 'titulo'; nivel: number; id: string; texto: TramoLegal[] }
  | { tipo: 'parrafo'; texto: TramoLegal[] }
  | { tipo: 'lista'; ordenada: boolean; inicio: number; items: TramoLegal[][] }
  | { tipo: 'nota'; bloques: BloqueLegal[] }
  | { tipo: 'tabla'; columnas: TramoLegal[][]; filas: TramoLegal[][][] }
  | { tipo: 'separador' };

export interface DocumentoLegal {
  titulo: string;
  ruta: string;
  bloques: BloqueLegal[];
}

/** `false` mientras no exista un correo de contacto publicado. La pantalla no
 *  promete un canal que hoy no atendería nadie; el texto de reemplazo ya viene
 *  resuelto adentro de los bloques. */
export const HAY_CORREO_DE_CONTACTO = false;

export const DOCUMENTOS_LEGALES: DocumentoLegal[] = [
  {
    "titulo": "Política de privacidad",
    "ruta": "/privacidad",
    "bloques": [
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"App:","fuerte":true},
          {"texto":" Encuentra tu Mascota · "},
          {"texto":"Última actualización:","fuerte":true},
          {"texto":" sin publicar todavía · "},
          {"texto":"Versión:","fuerte":true},
          {"texto":" 1.0"}
        ]
      },
      {
        "tipo": "nota",
        "bloques": [
          {
            "tipo": "parrafo",
            "texto": [
              {"texto":"⚠️ "},
              {"texto":"Esto no es asesoría legal.","fuerte":true},
              {
                "texto": " Es un texto escrito en serio, con la Ley 21.719 de Chile a la vista, para que se entienda de verdad cómo funciona la app y qué pasa con tus datos. "
              },
              {"texto":"Antes de publicarlo en las tiendas debería revisarlo un abogado.","fuerte":true}
            ]
          }
        ]
      },
      {"tipo":"separador"},
      {
        "tipo": "titulo",
        "nivel": 2,
        "id": "leelo-en-30-segundos",
        "texto": [{"texto":"Léelo en 30 segundos"}]
      },
      {
        "tipo": "lista",
        "ordenada": false,
        "inicio": 1,
        "items": [
          [{"texto":"Publicamos tu reporte para que tus vecinos lo vean. Eso es todo el producto."}],
          [
            {"texto":"Tu teléfono y tu red social son privados","fuerte":true},
            {"texto":": solo los ves tú. No los publicamos, no los vendemos, no se los damos a nadie."}
          ],
          [
            {"texto":"La ubicación que se ve en el mapa no es la exacta.","fuerte":true},
            {"texto":" La movemos al azar unos 250 metros y la precisa nunca se guarda."}
          ],
          [
            {"texto":"La app es "},
            {"texto":"gratis y sin publicidad","fuerte":true},
            {"texto":". No hacemos perfiles publicitarios ni te rastreamos entre sitios."}
          ],
          [
            {"texto":"Tus conversaciones del chat no las leemos.","fuerte":true},
            {"texto":" Solo se revisa un hilo puntual si alguien lo denuncia."}
          ],
          [
            {"texto":"Puedes "},
            {"texto":"borrar tu cuenta desde la app","fuerte":true},
            {"texto":", cuando quieras, sin pedirle permiso a nadie."}
          ]
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [{"texto":"Lo que sigue es lo mismo, pero completo, porque la ley pide que esté todo escrito."}]
      },
      {"tipo":"separador"},
      {
        "tipo": "titulo",
        "nivel": 2,
        "id": "1-quien-trata-tus-datos",
        "texto": [{"texto":"1. Quién trata tus datos"}]
      },
      {
        "tipo": "tabla",
        "columnas": [],
        "filas": [
          [
            [{"texto":"Responsable","fuerte":true}],
            [{"texto":"Pablo Espinoza, persona natural, domiciliado en Chile"}]
          ],
          [[{"texto":"Nombre de la app","fuerte":true}],[{"texto":"Encuentra tu Mascota"}]],
          [
            [{"texto":"RUT / razón social","fuerte":true}],
            [{"texto":"RUT o razón social aún por definir"}]
          ],
          [
            [{"texto":"Domicilio para notificaciones","fuerte":true}],
            [{"texto":"domicilio aún por definir"}]
          ],
          [
            [{"texto":"Correo de contacto y canal de derechos","fuerte":true}],
            [{"texto":"todavía no hay uno publicado"}]
          ],
          [
            [{"texto":"Sitio web","fuerte":true}],
            [
              {"texto":"todavía sin dominio definitivo (hoy: "},
              {"texto":"https://encuentras-mascota.pages.dev","codigo":true},
              {"texto":")"}
            ]
          ]
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "No hay un Delegado de Protección de Datos: la app la opera una sola persona, y esa persona es quien responde."
          }
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "Todavía no publicamos un correo de contacto, y preferimos no prometerte un canal que hoy no atenderíamos. Mientras tanto, lo que puedes resolver por tu cuenta está en la app: Perfil → Editar perfil, Perfil → Avisos y Perfil → Borrar mi cuenta. Habrá un correo publicado antes de que la app llegue a App Store y Google Play, porque ambas tiendas lo exigen."
          }
        ]
      },
      {"tipo":"separador"},
      {
        "tipo": "titulo",
        "nivel": 2,
        "id": "2-que-datos-tratamos-para-que-con-que-base-legal-y-cuanto-los-guardamos",
        "texto": [{"texto":"2. Qué datos tratamos, para qué, con qué base legal y cuánto los guardamos"}]
      },
      {
        "tipo": "parrafo",
        "texto": [{"texto":"Esta es la tabla que la ley pide. Está ordenada por lo que tú haces en la app."}]
      },
      {
        "tipo": "titulo",
        "nivel": 3,
        "id": "2-1-cuando-te-creas-una-cuenta",
        "texto": [{"texto":"2.1 Cuando te creas una cuenta"}]
      },
      {
        "tipo": "tabla",
        "columnas": [
          [{"texto":"Dato"}],
          [{"texto":"Para qué"}],
          [{"texto":"Base de licitud"}],
          [{"texto":"Cuánto lo guardamos"}]
        ],
        "filas": [
          [
            [{"texto":"Correo electrónico","fuerte":true}],
            [
              {
                "texto": "Identificar tu cuenta, entrar, recuperar la contraseña, avisarte de cosas de tu reporte"
              }
            ],
            [{"texto":"Ejecución del servicio","fuerte":true},{"texto":" que pediste al registrarte"}],
            [
              {
                "texto": "Mientras tengas cuenta. Al borrarla, se elimina de verdad de nuestro sistema de autenticación"
              }
            ]
          ],
          [
            [{"texto":"Contraseña","fuerte":true}],
            [{"texto":"Entrar a tu cuenta"}],
            [{"texto":"Ejecución del servicio"}],
            [
              {
                "texto": "Nunca la vemos: la guarda Supabase cifrada con un hash. No es recuperable, solo reemplazable"
              }
            ]
          ],
          [
            [{"texto":"Nombre","fuerte":true},{"texto":" (el que tú escribas)"}],
            [
              {"texto":"Firmar tus reportes, pistas y mensajes, para que tus vecinos sepan con quién hablan"}
            ],
            [{"texto":"Ejecución del servicio"}],
            [{"texto":"Mientras tengas cuenta"}]
          ],
          [
            [{"texto":"Fecha de nacimiento","fuerte":true}],
            [{"texto":"Verificar que cumples la edad mínima (ver §7)"}],
            [
              {"texto":"Cumplimiento de una obligación legal","fuerte":true},
              {
                "texto": " (no podemos tratar datos de menores de 14 sin autorización de su madre, padre o tutor)"
              }
            ],
            [
              {"texto":"Mientras tengas cuenta. "},
              {"texto":"Es privada: nadie más la ve, ni siquiera aparece en tu perfil público","fuerte":true}
            ]
          ],
          [
            [{"texto":"Foto de perfil","fuerte":true},{"texto":" (opcional)"}],
            [{"texto":"Que te reconozcan en el chat y en las pistas"}],
            [
              {"texto":"Tu consentimiento","fuerte":true},
              {"texto":" — es opcional y puedes quitarla cuando quieras"}
            ],
            [{"texto":"Hasta que la borres o borres tu cuenta"}]
          ],
          [
            [{"texto":"Teléfono / WhatsApp","fuerte":true},{"texto":" (opcional)"}],
            [
              {"texto":"Que aparezca en el "},
              {"texto":"afiche imprimible","fuerte":true},
              {"texto":" que tú generas y decides compartir"}
            ],
            [{"texto":"Tu consentimiento","fuerte":true}],
            [{"texto":"Hasta que lo borres o borres tu cuenta"}]
          ],
          [
            [{"texto":"Red social","fuerte":true},{"texto":" (opcional)"}],
            [{"texto":"Lo mismo que el teléfono"}],
            [{"texto":"Tu consentimiento","fuerte":true}],
            [{"texto":"Hasta que la borres o borres tu cuenta"}]
          ]
        ]
      },
      {
        "tipo": "nota",
        "bloques": [
          {
            "tipo": "parrafo",
            "texto": [
              {"texto":"🔒 "},
              {"texto":"El teléfono y la red social son privados.","fuerte":true},
              {"texto":" Desde el 19 de julio de 2026 nuestro servidor "},
              {"texto":"no permite que nadie los lea, salvo tú","fuerte":true},
              {
                "texto": ". No es una promesa de buena voluntad: es un permiso a nivel de columna en la base de datos. Ni otro usuario con cuenta, ni alguien que use nuestra API por fuera de la app, puede pedirlos."
              }
            ]
          },
          {
            "tipo": "parrafo",
            "texto": [
              {
                "texto": "Si tú pones tu teléfono en el afiche y compartes el afiche por WhatsApp o lo pegas en un poste, eso ya es una decisión tuya y sale de nuestro control. Está bien: para eso sirve el afiche. Solo queremos que quede claro quién lo publica."
              }
            ]
          }
        ]
      },
      {
        "tipo": "titulo",
        "nivel": 3,
        "id": "2-2-cuando-publicas-un-reporte-de-mascota-perdida-o-encontrada",
        "texto": [{"texto":"2.2 Cuando publicas un reporte de mascota perdida o encontrada"}]
      },
      {
        "tipo": "tabla",
        "columnas": [
          [{"texto":"Dato"}],
          [{"texto":"Para qué"}],
          [{"texto":"Base de licitud"}],
          [{"texto":"Cuánto lo guardamos"}]
        ],
        "filas": [
          [
            [{"texto":"Fotos de la mascota","fuerte":true}],
            [{"texto":"Que la reconozcan"}],
            [{"texto":"Ejecución del servicio (lo pediste tú al publicar)"}],
            [{"texto":"Hasta que borres el reporte o tu cuenta"}]
          ],
          [
            [{"texto":"Descripción, especie, raza, color, nombre de la mascota","fuerte":true}],
            [{"texto":"Que la busquen y la encuentren"}],
            [{"texto":"Ejecución del servicio"}],
            [{"texto":"Ídem"}]
          ],
          [
            [{"texto":"Ubicación aproximada","fuerte":true}],
            [{"texto":"Mostrar el reporte a la gente que vive cerca"}],
            [{"texto":"Ejecución del servicio"}],
            [{"texto":"Ídem"}]
          ],
          [
            [{"texto":"Recompensa","fuerte":true},{"texto":" (opcional, monto informativo)"}],
            [{"texto":"Que se sepa que ofreces una"}],
            [{"texto":"Tu consentimiento"}],
            [{"texto":"Ídem"}]
          ],
          [
            [{"texto":"Fecha del reporte y de la última actualización","fuerte":true}],
            [{"texto":"Ordenar los reportes y decirte si son recientes"}],
            [{"texto":"Ejecución del servicio"}],
            [{"texto":"Ídem"}]
          ]
        ]
      },
      {
        "tipo": "nota",
        "bloques": [
          {
            "tipo": "parrafo",
            "texto": [
              {"texto":"📍 "},
              {"texto":"La ubicación que se publica no es la exacta.","fuerte":true},
              {"texto":" Antes de guardarla, la desplazamos a una distancia y en una dirección elegidas "},
              {"texto":"al azar","fuerte":true},
              {"texto":", dentro de un radio de unos "},
              {"texto":"250 metros","fuerte":true},
              {"texto":". La coordenada precisa "},
              {"texto":"no se guarda en ninguna parte","fuerte":true},
              {
                "texto": " — ni en la base de datos, ni en un registro, ni \"por si acaso\". Lo que no se guarda no se puede filtrar ni pedir por orden judicial."
              }
            ]
          },
          {
            "tipo": "parrafo",
            "texto": [
              {"texto":"Lo hacemos porque el reporte es público y se ve "},
              {"texto":"sin cuenta","fuerte":true},
              {
                "texto": ": si publicáramos el punto exacto, estaríamos publicando en un mapa abierto la cuadra donde vives. Eso habilita acoso, robo y estafas dirigidas. Para buscar una mascota, un error de 250 metros no cambia nada."
              }
            ]
          },
          {
            "tipo": "parrafo",
            "texto": [
              {"texto":"Y desplazamos "},
              {"texto":"al azar","fuerte":true},
              {
                "texto": ", no redondeamos. El redondeo se puede revertir cruzando varios reportes de la misma persona; un desplazamiento aleatorio distinto en cada reporte, no."
              }
            ]
          }
        ]
      },
      {
        "tipo": "nota",
        "bloques": [
          {
            "tipo": "parrafo",
            "texto": [
              {"texto":"🖼️ "},
              {"texto":"Las fotos se recomprimen antes de subirse","fuerte":true},
              {"texto":", y ese proceso "},
              {"texto":"borra los metadatos EXIF","fuerte":true},
              {
                "texto": " — incluidas las coordenadas GPS que tu teléfono le pone a cada foto. Verificado subiendo una foto con GPS real y revisando el archivo que quedó guardado. Sin esto, la foto delataría tu casa con mucha más precisión que el mapa."
              }
            ]
          },
          {
            "tipo": "parrafo",
            "texto": [
              {"texto":"Nota honesta:","enfasis":true},
              {"texto":" esa verificación se hizo sobre la versión "},
              {"texto":"web","fuerte":true},
              {
                "texto": " de la app. La versión nativa (Android/iOS) usa otra implementación de la misma librería y todavía no se comprobó con la misma prueba."
              }
            ]
          }
        ]
      },
      {
        "tipo": "titulo",
        "nivel": 3,
        "id": "2-3-cuando-participas-pistas-avistamientos-novedades-mensajes",
        "texto": [{"texto":"2.3 Cuando participas: pistas, avistamientos, novedades, mensajes"}]
      },
      {
        "tipo": "tabla",
        "columnas": [
          [{"texto":"Dato"}],
          [{"texto":"Para qué"}],
          [{"texto":"Base de licitud"}],
          [{"texto":"Cuánto lo guardamos"}]
        ],
        "filas": [
          [
            [{"texto":"Pistas que dejas en reportes ajenos","fuerte":true}],
            [{"texto":"Ayudar a quien busca"}],
            [{"texto":"Ejecución del servicio"}],
            [
              {"texto":"Mientras exista el reporte. "},
              {"texto":"Si borras tu cuenta, la pista sobrevive firmada como \"Un vecino\"","fuerte":true},
              {"texto":" (ver §5)"}
            ]
          ],
          [
            [
              {"texto":"Avistamientos","fuerte":true},
              {"texto":" (\"lo vi por acá\"): ubicación, nota y foto opcional"}
            ],
            [{"texto":"Armar el rastro de dónde estuvo la mascota"}],
            [{"texto":"Ejecución del servicio"}],
            [
              {"texto":"Ídem. La ubicación del avistamiento "},
              {"texto":"también se difumina 250 m","fuerte":true}
            ]
          ],
          [
            [{"texto":"Novedades","fuerte":true},{"texto":" que publica el dueño del reporte"}],
            [{"texto":"Contar cómo va la búsqueda"}],
            [{"texto":"Ejecución del servicio"}],
            [{"texto":"Mientras exista el reporte"}]
          ],
          [
            [{"texto":"Mensajes del chat 1:1","fuerte":true}],
            [{"texto":"Que puedan coordinar la devolución"}],
            [{"texto":"Ejecución del servicio"}],
            [
              {"texto":"Mientras exista la conversación. "},
              {"texto":"No los leemos","fuerte":true},
              {
                "texto": ", salvo que alguien nos denuncie una conversación y tengamos que revisarla para moderar"
              }
            ]
          ],
          [
            [{"texto":"Favoritos / reportes guardados","fuerte":true}],
            [{"texto":"Tu lista privada de seguimiento"}],
            [{"texto":"Ejecución del servicio"}],
            [{"texto":"Mientras tengas cuenta. Es privada: nadie ve qué guardaste"}]
          ]
        ]
      },
      {"tipo":"titulo","nivel":3,"id":"2-4-avisos","texto":[{"texto":"2.4 Avisos"}]},
      {
        "tipo": "tabla",
        "columnas": [
          [{"texto":"Dato"}],
          [{"texto":"Para qué"}],
          [{"texto":"Base de licitud"}],
          [{"texto":"Cuánto lo guardamos"}]
        ],
        "filas": [
          [
            [
              {"texto":"Tus preferencias de avisos","fuerte":true},
              {"texto":" (qué te avisamos y por qué canal)"}
            ],
            [{"texto":"Mandarte solo lo que pediste"}],
            [{"texto":"Ejecución del servicio"}],
            [{"texto":"Mientras tengas cuenta"}]
          ],
          [
            [{"texto":"Tu zona de alerta","fuerte":true},{"texto":" (centro y radio, si la configuras)"}],
            [{"texto":"Avisarte cuando aparece un reporte cerca tuyo"}],
            [{"texto":"Tu consentimiento — es opcional"}],
            [{"texto":"Hasta que la borres o borres tu cuenta"}]
          ],
          [
            [{"texto":"Token de notificación push","fuerte":true},{"texto":" del dispositivo"}],
            [{"texto":"Mandarte el aviso al teléfono"}],
            [{"texto":"Tu consentimiento (el sistema operativo te pregunta primero)"}],
            [{"texto":"Mientras tengas la app instalada y los push activados"}]
          ],
          [
            [
              {"texto":"Cola interna de eventos","fuerte":true},
              {"texto":" (qué aviso hay que mandar y a quién)"}
            ],
            [{"texto":"Que el aviso salga"}],
            [{"texto":"Ejecución del servicio"}],
            [{"texto":"Mientras el aviso esté pendiente de salir."}]
          ]
        ]
      },
      {
        "tipo": "titulo",
        "nivel": 3,
        "id": "2-5-moderacion-y-seguridad",
        "texto": [{"texto":"2.5 Moderación y seguridad"}]
      },
      {
        "tipo": "tabla",
        "columnas": [
          [{"texto":"Dato"}],
          [{"texto":"Para qué"}],
          [{"texto":"Base de licitud"}],
          [{"texto":"Cuánto lo guardamos"}]
        ],
        "filas": [
          [
            [{"texto":"Denuncias","fuerte":true},{"texto":" (qué denunciaste, por qué, cuándo)"}],
            [{"texto":"Revisar y actuar sobre contenido o conductas que rompen las reglas"}],
            [
              {"texto":"Interés legítimo","fuerte":true},
              {"texto":" en mantener la app segura, y cumplir lo que exigen las tiendas de apps"}
            ],
            [{"texto":"Mientras sirvan para sostener la decisión de moderación que motivaron."}]
          ],
          [
            [
              {"texto":"Registro de las acciones de moderación","fuerte":true},
              {"texto":" (qué se retiró, cuándo, por qué)"}
            ],
            [{"texto":"Poder demostrar que actuamos con diligencia"}],
            [{"texto":"Interés legítimo / defensa ante reclamos"}],
            [{"texto":"Ídem"}]
          ],
          [
            [
              {"texto":"Registros técnicos","fuerte":true},
              {"texto":" de Supabase y del hosting (IP, hora, tipo de petición)"}
            ],
            [{"texto":"Detectar abuso y ataques, y depurar errores"}],
            [{"texto":"Interés legítimo en la seguridad del servicio"}],
            [{"texto":"Lo que retenga cada proveedor por defecto."}]
          ]
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"No hacemos:","fuerte":true},
          {
            "texto": " publicidad, perfilamiento comercial, venta o cesión de datos a terceros, rastreo entre sitios ni apps, cookies de terceros, ni analítica que te identifique."
          }
        ]
      },
      {"tipo":"separador"},
      {
        "tipo": "titulo",
        "nivel": 2,
        "id": "3-quien-mas-ve-tus-datos",
        "texto": [{"texto":"3. Quién más ve tus datos"}]
      },
      {"tipo":"titulo","nivel":3,"id":"3-1-otros-usuarios","texto":[{"texto":"3.1 Otros usuarios"}]},
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"Los reportes son "},
          {"texto":"públicos y se ven sin tener cuenta","fuerte":true},
          {
            "texto": ". Eso no es un descuido: es lo que hace que funcione. Cualquier persona con el enlace —o que llegue por Google— puede ver:"
          }
        ]
      },
      {
        "tipo": "lista",
        "ordenada": false,
        "inicio": 1,
        "items": [
          [{"texto":"Las fotos y los datos de la mascota."}],
          [
            {"texto":"Tu "},
            {"texto":"nombre","fuerte":true},
            {"texto":" y tu "},
            {"texto":"foto de perfil","fuerte":true},
            {"texto":", porque firman el reporte."}
          ],
          [{"texto":"La "},{"texto":"ubicación aproximada","fuerte":true},{"texto":" (difuminada)."}],
          [{"texto":"Las pistas, avistamientos y novedades del reporte."}]
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"Nadie ve:","fuerte":true},
          {
            "texto": " tu correo, tu teléfono, tu red social, tu fecha de nacimiento, tus mensajes privados, tus reportes guardados, tu zona de alerta ni tus preferencias de avisos."
          }
        ]
      },
      {
        "tipo": "titulo",
        "nivel": 3,
        "id": "3-2-proveedores-que-nos-prestan-servicio",
        "texto": [{"texto":"3.2 Proveedores que nos prestan servicio"}]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "No les \"vendemos\" nada: son la infraestructura sobre la que corre la app. Cada uno trata datos por encargo nuestro y solo para lo que le encargamos."
          }
        ]
      },
      {
        "tipo": "tabla",
        "columnas": [
          [{"texto":"Proveedor"}],
          [{"texto":"Qué hace"}],
          [{"texto":"Qué datos toca"}],
          [{"texto":"Dónde está"}]
        ],
        "filas": [
          [
            [{"texto":"Supabase","fuerte":true},{"texto":" (base de datos, cuentas, fotos)"}],
            [{"texto":"Es donde vive la app entera"}],
            [{"texto":"Todos los de §2"}],
            [{"texto":"Servidores de "},{"texto":"AWS fuera de Chile","fuerte":true},{"texto":"."}]
          ],
          [
            [{"texto":"Cloudflare Pages","fuerte":true}],
            [{"texto":"Sirve el sitio web"}],
            [{"texto":"Datos técnicos de conexión"}],
            [{"texto":"Red global de Cloudflare"}]
          ],
          [
            [{"texto":"Proveedor de correo","fuerte":true}],
            [{"texto":"Manda los correos de aviso y de recuperación de contraseña"}],
            [{"texto":"Tu correo y el texto del aviso"}],
            [{"texto":"Resend: Estados Unidos.","fuerte":true},{"texto":" Brevo: Unión Europea."}]
          ],
          [
            [{"texto":"Expo (Expo Push Notifications)","fuerte":true}],
            [{"texto":"Manda las notificaciones al teléfono"}],
            [{"texto":"El token del dispositivo y el texto del aviso"}],
            [{"texto":"Estados Unidos"}]
          ],
          [
            [{"texto":"Google Play / App Store","fuerte":true}],
            [{"texto":"Distribuyen la app"}],
            [{"texto":"Los datos de tu cuenta de tienda, que "},{"texto":"nosotros no vemos","fuerte":true}],
            [{"texto":"Estados Unidos"}]
          ],
          [
            [{"texto":"Sentry","fuerte":true},{"texto":" (solo si se activa)"}],
            [{"texto":"Reporta errores de la app"}],
            [{"texto":"Datos técnicos del error"}],
            [{"texto":"Hoy no está activado."}]
          ]
        ]
      },
      {"tipo":"titulo","nivel":3,"id":"3-3-autoridades","texto":[{"texto":"3.3 Autoridades"}]},
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"Entregamos datos a un tribunal, al Ministerio Público o a Carabineros "},
          {"texto":"solo si nos llega un requerimiento formal","fuerte":true},
          {"texto":" que estemos obligados a cumplir. Si podemos avisarte, te avisamos."}
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"Ten presente lo que ya dijimos: "},
          {"texto":"la ubicación exacta no la tenemos","fuerte":true},
          {"texto":", así que no podemos entregarla aunque nos la pidan."}
        ]
      },
      {"tipo":"separador"},
      {
        "tipo": "titulo",
        "nivel": 2,
        "id": "4-transferencias-internacionales-de-datos",
        "texto": [{"texto":"4. Transferencias internacionales de datos"}]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"Sí, tus datos salen de Chile.","fuerte":true},
          {
            "texto": " La app corre sobre servicios que están fuera del país, y la ley nos obliga a decírtelo con claridad:"
          }
        ]
      },
      {
        "tipo": "lista",
        "ordenada": false,
        "inicio": 1,
        "items": [
          [
            {"texto":"Supabase","fuerte":true},
            {
              "texto": ", que guarda la base de datos, las cuentas y las fotos, corre sobre infraestructura de "
            },
            {"texto":"Amazon Web Services fuera de Chile","fuerte":true},
            {"texto":"."}
          ],
          [
            {"texto":"El "},
            {"texto":"correo","fuerte":true},
            {"texto":" se envía a través de un proveedor que está en "},
            {"texto":"Estados Unidos","fuerte":true},
            {"texto":" (Resend) o en la "},
            {"texto":"Unión Europea","fuerte":true},
            {"texto":" (Brevo), según cuál esté activo."}
          ],
          [
            {"texto":"Las "},
            {"texto":"notificaciones push","fuerte":true},
            {"texto":" pasan por "},
            {"texto":"Expo","fuerte":true},
            {"texto":", en Estados Unidos."}
          ]
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"Esto significa que datos como tu correo, tu nombre y tus reportes se "},
          {"texto":"almacenan y procesan fuera de Chile","fuerte":true},
          {"texto":", en países cuya legislación de protección de datos puede ser distinta a la chilena."}
        ]
      },
      {"tipo":"parrafo","texto":[{"texto":"Lo que hacemos al respecto:"}]},
      {
        "tipo": "lista",
        "ordenada": true,
        "inicio": 1,
        "items": [
          [
            {
              "texto": "Elegimos proveedores con compromisos contractuales de protección de datos y que se comprometen a tratarlos solo por encargo nuestro."
            }
          ],
          [
            {"texto":"Minimizamos lo que sale del país.","fuerte":true},
            {
              "texto": " La coordenada exacta no se guarda; los metadatos EXIF se eliminan; el teléfono y la red social no se pueden leer ni siquiera desde nuestra propia API."
            }
          ],
          [{"texto":"Todo viaja cifrado (HTTPS/TLS) y se guarda cifrado en reposo."}]
        ]
      },
      {"tipo":"separador"},
      {
        "tipo": "titulo",
        "nivel": 2,
        "id": "5-que-pasa-cuando-borras-tu-cuenta",
        "texto": [{"texto":"5. Qué pasa cuando borras tu cuenta"}]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"Puedes borrarla desde la app: "},
          {"texto":"Perfil → Borrar mi cuenta","fuerte":true},
          {"texto":". Es inmediato e irreversible. No hay que escribir a nadie ni esperar."}
        ]
      },
      {"tipo":"parrafo","texto":[{"texto":"Se destruye lo que es solo tuyo:","fuerte":true}]},
      {
        "tipo": "lista",
        "ordenada": false,
        "inicio": 1,
        "items": [
          [
            {
              "texto": "Tus reportes, con todas sus fotos (se borran del almacenamiento, no solo de la lista)."
            }
          ],
          [
            {
              "texto": "Tu zona de alerta, tus reportes guardados, tus preferencias de avisos y tus tokens push."
            }
          ],
          [
            {"texto":"Tu usuario del sistema de autenticación, "},
            {"texto":"incluido tu correo","fuerte":true},
            {
              "texto": ". Eso es lo que hace que el borrado sea de verdad irreversible: sin el correo, el identificador que queda ya no se puede asociar a ninguna persona. Y como efecto secundario, "
            },
            {"texto":"ese correo queda libre","fuerte":true},
            {"texto":" por si algún día quieres volver."}
          ]
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [{"texto":"Sobrevive, pero anónimo, lo que también es de otra persona:","fuerte":true}]
      },
      {
        "tipo": "lista",
        "ordenada": false,
        "inicio": 1,
        "items": [
          [
            {"texto":"Las "},
            {"texto":"pistas y avistamientos","fuerte":true},
            {"texto":" que dejaste en reportes ajenos quedan firmados como "},
            {"texto":"\"Un vecino\"","fuerte":true},
            {
              "texto": ", sin tu nombre ni tu foto. Si se borraran, le arrancaríamos información a alguien que todavía está buscando a su mascota."
            }
          ],
          [
            {"texto":"Tus "},
            {"texto":"conversaciones","fuerte":true},
            {"texto":" quedan visibles para la otra persona, con tu nombre reemplazado por "},
            {"texto":"\"Cuenta eliminada\"","fuerte":true},
            {"texto":" y sin posibilidad de responderte."}
          ]
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [{"texto":"Dos cosas que conviene que sepas antes de apretar el botón:","fuerte":true}]
      },
      {
        "tipo": "lista",
        "ordenada": true,
        "inicio": 1,
        "items": [
          [
            {"texto":"Si borras tu cuenta, "},
            {
              "texto": "también se borran las pistas y avistamientos que otros dejaron en tus reportes",
              "fuerte": true
            },
            {"texto":". Se van con el reporte."}
          ],
          [
            {
              "texto": "Lo que ya compartiste fuera de la app (un afiche que mandaste por WhatsApp, una captura de pantalla que alguien guardó) no lo podemos borrar. No está en nuestras manos."
            }
          ]
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"📄 "},
          {"texto":"También puedes pedir el borrado sin instalar la app","fuerte":true},
          {"texto":", desde la página pública de solicitud de borrado del sitio web: /borrar-cuenta."}
        ]
      },
      {"tipo":"separador"},
      {
        "tipo": "titulo",
        "nivel": 2,
        "id": "6-tus-derechos-arcop",
        "texto": [{"texto":"6. Tus derechos (ARCOP)"}]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "La Ley 21.719 te da estos derechos sobre tus datos. Son gratis y los puedes ejercer las veces que quieras."
          }
        ]
      },
      {
        "tipo": "tabla",
        "columnas": [[{"texto":"Derecho"}],[{"texto":"Qué significa"}],[{"texto":"Cómo lo ejerces"}]],
        "filas": [
          [
            [{"texto":"A","fuerte":true},{"texto":"cceso"}],
            [{"texto":"Saber qué datos tuyos tenemos y qué hacemos con ellos"}],
            [{"texto":"En la app ves casi todo, directamente. Lo que falte, por el canal de contacto"}]
          ],
          [
            [{"texto":"R","fuerte":true},{"texto":"ectificación"}],
            [{"texto":"Corregir datos equivocados o incompletos"}],
            [
              {"texto":"Perfil → "},
              {"texto":"Editar perfil","fuerte":true},
              {"texto":". Tu nombre, foto, teléfono y red social los cambias tú, al instante"}
            ]
          ],
          [
            [{"texto":"C","fuerte":true},{"texto":"ancelación (supresión)"}],
            [{"texto":"Que borremos tus datos"}],
            [{"texto":"Perfil → "},{"texto":"Borrar mi cuenta","fuerte":true},{"texto":", al instante"}]
          ],
          [
            [{"texto":"O","fuerte":true},{"texto":"posición"}],
            [{"texto":"Que dejemos de tratar tus datos para una finalidad"}],
            [
              {"texto":"Perfil → "},
              {"texto":"Avisos","fuerte":true},
              {"texto":", para apagar los avisos por canal y por tipo"}
            ]
          ],
          [
            [{"texto":"P","fuerte":true},{"texto":"ortabilidad"}],
            [{"texto":"Que te entreguemos tus datos en un formato que puedas llevarte"}],
            [
              {"texto":"Por el canal de contacto: te mandamos un "},
              {"texto":"JSON","fuerte":true},
              {"texto":" con tus reportes, pistas, avistamientos y mensajes"}
            ]
          ]
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"El canal:","fuerte":true},
          {
            "texto": " Todavía no publicamos un correo de contacto, y preferimos no prometerte un canal que hoy no atenderíamos. Mientras tanto, lo que puedes resolver por tu cuenta está en la app: Perfil → Editar perfil, Perfil → Avisos y Perfil → Borrar mi cuenta. Habrá un correo publicado antes de que la app llegue a App Store y Google Play, porque ambas tiendas lo exigen."
          }
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [{"texto":"Qué te comprometemos cuando ese canal exista:","fuerte":true}]
      },
      {
        "tipo": "lista",
        "ordenada": false,
        "inicio": 1,
        "items": [
          [{"texto":"Acusar recibo dentro de "},{"texto":"5 días hábiles","fuerte":true},{"texto":"."}],
          [
            {"texto":"Responderte "},
            {"texto":"como máximo en 30 días corridos","fuerte":true},
            {
              "texto": ", que es el plazo que fija la ley. Normalmente vamos a ser mucho más rápidos: la app la opera una persona y casi todos estos pedidos ya están resueltos con un botón."
            }
          ],
          [
            {
              "texto": "Para confirmar que eres tú, respondemos al correo con el que está registrada la cuenta.",
              "fuerte": true
            },
            {"texto":" A propósito "},
            {"texto":"no te vamos a pedir foto de tu cédula ni de tu RUT","fuerte":true},
            {
              "texto": ": pedirte un documento de identidad para probar quién eres significaría que nos quedamos con un dato mucho más sensible que los que ya tenemos. Si el pedido llega desde otro correo, te vamos a pedir que lo repitas desde el correo de la cuenta."
            }
          ],
          [
            {"texto":"Si no podemos hacer lo que pides, te explicamos "},
            {"texto":"por qué","fuerte":true},
            {"texto":", con el fundamento, y te decimos qué puedes hacer al respecto."}
          ]
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"Si no te gusta nuestra respuesta","fuerte":true},
          {"texto":", puedes reclamar ante la "},
          {"texto":"Agencia de Protección de Datos Personales","fuerte":true},
          {
            "texto": " de Chile. No hace falta que nos avises antes, pero preferimos arreglarlo directamente contigo."
          }
        ]
      },
      {"tipo":"separador"},
      {"tipo":"titulo","nivel":2,"id":"7-menores-de-edad","texto":[{"texto":"7. Menores de edad"}]},
      {
        "tipo": "parrafo",
        "texto": [{"texto":"La edad mínima para tener cuenta es 14 años.","fuerte":true}]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "Por qué 14 y no 18: porque los que más buscan a una mascota perdida son justamente los cabros chicos de la casa, y porque la ley chilena distingue entre "
          },
          {"texto":"niños","fuerte":true},
          {"texto":" (menores de 14) y "},
          {"texto":"adolescentes","fuerte":true},
          {
            "texto": " (de 14 a 17). Para tratar datos de un niño necesitamos la autorización de su madre, padre o tutor, y no tenemos ninguna forma seria de obtenerla y verificarla. Para un adolescente, en cambio, el tratamiento de datos que no son sensibles puede apoyarse en su propio consentimiento informado. Nuestra app no trata datos sensibles, así que 14 es el límite que podemos sostener de verdad."
          }
        ]
      },
      {"tipo":"parrafo","texto":[{"texto":"Cómo lo aplicamos:"}]},
      {
        "tipo": "lista",
        "ordenada": true,
        "inicio": 1,
        "items": [
          [
            {"texto":"Al registrarte te pedimos tu fecha de nacimiento","fuerte":true},
            {
              "texto": " —día, mes y año—, no una casilla de \"confirmo que soy mayor\". Una casilla no informa nada y no demuestra nada."
            }
          ],
          [
            {"texto":"Si tienes menos de 14, "},
            {"texto":"no se crea la cuenta","fuerte":true},
            {"texto":". Pero "},
            {"texto":"no te echamos","fuerte":true},
            {
              "texto": ": puedes seguir viendo todos los reportes, el mapa y las fotos sin cuenta, que es justamente lo que sirve para buscar. Para publicar un reporte o escribirle a alguien, pídele a un adulto de tu casa que lo haga desde su cuenta."
            }
          ],
          [
            {"texto":"Tu fecha de nacimiento "},
            {"texto":"es privada","fuerte":true},
            {"texto":". No aparece en tu perfil ni la ve ningún otro usuario. La usamos solo para esto."}
          ],
          [
            {"texto":"Si nos avisan que un titular de cuenta es menor de 14","fuerte":true},
            {
              "texto": " —o si lo detectamos nosotros— suspendemos la cuenta, contactamos al correo registrado y, si no se acredita lo contrario, la eliminamos con el mismo procedimiento del §5. El detalle del procedimiento está en el spec de esta tanda."
            }
          ],
          [
            {
              "texto": "Si eres madre, padre o tutor y crees que un niño menor de 14 se creó una cuenta, avísanos por el canal de contacto (§12) con el correo o el nombre de usuario. La tratamos como prioritaria."
            }
          ]
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"Somos honestos sobre el límite de esto:","fuerte":true},
          {
            "texto": " un niño puede escribir una fecha falsa. No le pedimos cédula ni verificamos la identidad de nadie, porque hacerlo significaría recolectar documentos de identidad de todos nuestros usuarios para atrapar a unos pocos —el remedio sería peor que la enfermedad—. Lo que hacemos es un esfuerzo razonable y proporcionado: preguntar en serio, bloquear cuando corresponde, y actuar rápido cuando nos avisan."
          }
        ]
      },
      {"tipo":"separador"},
      {
        "tipo": "titulo",
        "nivel": 2,
        "id": "8-como-protegemos-tus-datos",
        "texto": [{"texto":"8. Cómo protegemos tus datos"}]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "No es una lista de buenas intenciones; es lo que efectivamente está implementado y verificado contra la base de datos real:"
          }
        ]
      },
      {
        "tipo": "lista",
        "ordenada": false,
        "inicio": 1,
        "items": [
          [
            {"texto":"Todo viaja cifrado","fuerte":true},
            {"texto":" (HTTPS/TLS) y se guarda cifrado en reposo."}
          ],
          [
            {"texto":"Tu contraseña no la tenemos.","fuerte":true},
            {"texto":" Se guarda con un hash irreversible. Ni Pablo puede verla."}
          ],
          [
            {"texto":"Seguridad a nivel de fila (RLS) en la base de datos.","fuerte":true},
            {
              "texto": " Cada tabla tiene reglas de acceso aplicadas por Postgres, no por la app. Aunque alguien se salte la app y hable directo con nuestra API, las reglas siguen ahí."
            }
          ],
          [
            {"texto":"Tu teléfono y tu red social tienen un permiso a nivel de columna","fuerte":true},
            {
              "texto": ": la base de datos simplemente no los entrega a nadie que no seas tú. No hay condición que burlar. Probado atacando la API real con un token de sesión válido de otra cuenta."
            }
          ],
          [
            {
              "texto": "Las funciones que borran o anonimizan tu cuenta no aceptan un destinatario.",
              "fuerte": true
            },
            {
              "texto": " No existe la forma de pedirle al servidor \"borra la cuenta de fulano\": la función solo puede actuar sobre quien está autenticado. Probado."
            }
          ],
          [
            {"texto":"Validación en el servidor","fuerte":true},
            {
              "texto": ", no solo en el formulario: los largos, las cantidades y los rangos se verifican en la base de datos."
            }
          ],
          [
            {"texto":"Las rutas de las fotos son aleatorias","fuerte":true},
            {
              "texto": " (128 bits), así que nadie puede recorrer el almacenamiento adivinando nombres de archivo."
            }
          ],
          [
            {"texto":"La coordenada exacta no se guarda","fuerte":true},
            {"texto":" y "},
            {"texto":"los metadatos EXIF se eliminan","fuerte":true},
            {"texto":" (§2.2)."}
          ],
          [
            {"texto":"Cabeceras de seguridad","fuerte":true},
            {
              "texto": " en el sitio web (HSTS, anti-clickjacking, control de referrer y de permisos del navegador)."
            }
          ]
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"Lo que "},
          {"texto":"todavía no","fuerte":true},
          {"texto":" tenemos, dicho de frente:"}
        ]
      },
      {
        "tipo": "lista",
        "ordenada": false,
        "inicio": 1,
        "items": [
          [{"texto":"No hay autenticación en dos pasos (2FA)."}],
          [
            {"texto":"El almacenamiento de fotos es un "},
            {"texto":"bucket público","fuerte":true},
            {
              "texto": ": cualquiera con la URL exacta ve la foto. Las URL no son adivinables, pero si compartes el enlace de una foto, ese enlace funciona."
            }
          ],
          [
            {
              "texto": "Al borrar un reporte, la foto asociada puede quedar en el almacenamiento aunque el reporte desaparezca."
            }
          ],
          [
            {
              "texto": "No hay una Content-Security-Policy en el sitio todavía, porque una mal ajustada rompe la app en silencio."
            }
          ]
        ]
      },
      {"tipo":"separador"},
      {
        "tipo": "titulo",
        "nivel": 2,
        "id": "9-si-hay-una-filtracion-de-datos",
        "texto": [{"texto":"9. Si hay una filtración de datos"}]
      },
      {"tipo":"parrafo","texto":[{"texto":"Si ocurre una brecha de seguridad que afecte tus datos:"}]},
      {
        "tipo": "lista",
        "ordenada": true,
        "inicio": 1,
        "items": [
          [
            {"texto":"La "},
            {"texto":"contenemos","fuerte":true},
            {"texto":" primero: cortar el acceso, rotar claves, cerrar el agujero."}
          ],
          [
            {
              "texto": "Avisamos a la Agencia de Protección de Datos Personales sin dilaciones indebidas.",
              "fuerte": true
            },
            {"texto":" La ley no fija un número de horas; nuestro compromiso interno es hacerlo dentro de "},
            {"texto":"72 horas","fuerte":true},
            {"texto":" desde que tomamos conocimiento, que es la referencia internacional."}
          ],
          [
            {"texto":"Si la brecha puede afectarte de verdad, te escribimos a ti","fuerte":true},
            {
              "texto": ", al correo de tu cuenta y con un aviso dentro de la app: qué pasó, qué datos tuyos, qué hicimos y qué te conviene hacer (cambiar la contraseña, desconfiar de mensajes raros)."
            }
          ],
          [{"texto":"Lo dejamos anotado en un registro interno de incidentes, con fechas."}]
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [{"texto":"El procedimiento completo, paso a paso, está en el spec de esta tanda."}]
      },
      {"tipo":"separador"},
      {
        "tipo": "titulo",
        "nivel": 2,
        "id": "10-decisiones-automatizadas",
        "texto": [{"texto":"10. Decisiones automatizadas"}]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "No tomamos ninguna decisión automatizada que produzca efectos jurídicos sobre ti ni que te afecte significativamente.",
            "fuerte": true
          },
          {
            "texto": " No hay algoritmos que te puntúen, te clasifiquen ni decidan nada sobre tu cuenta por su cuenta."
          }
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "Sí hay procesos automáticos, pero son mecánicos y no deciden nada sobre las personas:"
          }
        ]
      },
      {
        "tipo": "lista",
        "ordenada": false,
        "inicio": 1,
        "items": [
          [
            {"texto":"La "},
            {"texto":"búsqueda y el orden de los reportes","fuerte":true},
            {
              "texto": " se calculan por distancia y fecha. No hay curaduría editorial ni reportes \"destacados\"."
            }
          ],
          [
            {"texto":"Las "},
            {"texto":"coincidencias perdido ↔ encontrado","fuerte":true},
            {
              "texto": " que te sugerimos son una comparación simple de especie y cercanía geográfica. Son una sugerencia para que la mires tú, no una conclusión."
            }
          ],
          [
            {"texto":"Los "},
            {"texto":"avisos","fuerte":true},
            {
              "texto": " se disparan por reglas fijas (hay un reporte nuevo en tu zona, alguien te escribió), según las preferencias que tú configuraste."
            }
          ]
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "Las decisiones que sí afectan a una cuenta —suspenderla o eliminarla por incumplimiento— las revisa y las toma "
          },
          {"texto":"una persona","fuerte":true},
          {
            "texto": ", no un proceso automático. Una suspensión, además, se puede levantar. Cómo te enteras de una de estas medidas, y qué canal hay y cuál no hay todavía para reclamarla, está en el §7 de los Términos de uso."
          }
        ]
      },
      {"tipo":"separador"},
      {
        "tipo": "titulo",
        "nivel": 2,
        "id": "11-cambios-a-esta-politica",
        "texto": [{"texto":"11. Cambios a esta política"}]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "Si la cambiamos, actualizamos la fecha de arriba y subimos la versión. Si el cambio es importante —datos nuevos, finalidad nueva, un proveedor nuevo— te avisamos dentro de la app y, si corresponde, por correo, "
          },
          {"texto":"antes","fuerte":true},
          {"texto":" de que empiece a aplicarse."}
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "Las versiones anteriores quedan en el historial del repositorio del proyecto, así que se puede ver exactamente qué cambió y cuándo."
          }
        ]
      },
      {"tipo":"separador"},
      {"tipo":"titulo","nivel":2,"id":"12-contacto","texto":[{"texto":"12. Contacto"}]},
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "Todavía no publicamos un correo de contacto, y preferimos no prometerte un canal que hoy no atenderíamos. Mientras tanto, lo que puedes resolver por tu cuenta está en la app: Perfil → Editar perfil, Perfil → Avisos y Perfil → Borrar mi cuenta. Habrá un correo publicado antes de que la app llegue a App Store y Google Play, porque ambas tiendas lo exigen."
          }
        ]
      }
    ]
  },
  {
    "titulo": "Términos de uso",
    "ruta": "/terminos",
    "bloques": [
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"App:","fuerte":true},
          {"texto":" Encuentra tu Mascota · "},
          {"texto":"Última actualización:","fuerte":true},
          {"texto":" sin publicar todavía · "},
          {"texto":"Versión:","fuerte":true},
          {"texto":" 1.0"}
        ]
      },
      {
        "tipo": "nota",
        "bloques": [
          {
            "tipo": "parrafo",
            "texto": [
              {"texto":"⚠️ "},
              {"texto":"Esto no es asesoría legal.","fuerte":true},
              {
                "texto": " Es un texto escrito en serio, con la ley chilena y las reglas de Google Play y la App Store a la vista, para que se entienda de verdad qué puedes y qué no puedes hacer acá. "
              },
              {"texto":"Antes de publicarlo en las tiendas debería revisarlo un abogado.","fuerte":true}
            ]
          }
        ]
      },
      {"tipo":"separador"},
      {
        "tipo": "titulo",
        "nivel": 2,
        "id": "leelo-en-30-segundos",
        "texto": [{"texto":"Léelo en 30 segundos"}]
      },
      {
        "tipo": "lista",
        "ordenada": false,
        "inicio": 1,
        "items": [
          [
            {"texto":"La app es "},
            {"texto":"gratis","fuerte":true},
            {
              "texto": " y sirve para una cosa: que los vecinos ayuden a reunir mascotas perdidas con su familia."
            }
          ],
          [
            {"texto":"Necesitas tener 14 años o más","fuerte":true},
            {"texto":" para crearte una cuenta. Sin cuenta puedes mirar todo."}
          ],
          [
            {"texto":"Está prohibido vender, regalar, rifar o promocionar animales acá.","fuerte":true},
            {"texto":" Esta app no es una vitrina de mascotas."}
          ],
          [
            {"texto":"Las recompensas son entre tú y la otra persona.","fuerte":true},
            {
              "texto": " Nosotros no cobramos, no pagamos, no garantizamos y no mediamos. Ni un peso pasa por la app."
            }
          ],
          [
            {"texto":"Nunca transfieras dinero antes de ver a la mascota en persona.","fuerte":true},
            {"texto":" La estafa del \"tengo a tu mascota, transfiere la recompensa\" existe y es común."}
          ],
          [
            {
              "texto": "Si rompes las reglas, te retiramos el contenido y podemos suspender o eliminar tu cuenta."
            }
          ],
          [
            {"texto":"Si ves algo que está mal, "},
            {"texto":"denúncialo","fuerte":true},
            {"texto":". Lo revisamos rápido."}
          ]
        ]
      },
      {"tipo":"separador"},
      {
        "tipo": "titulo",
        "nivel": 2,
        "id": "1-que-es-esto-y-quien-lo-opera",
        "texto": [{"texto":"1. Qué es esto y quién lo opera"}]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"Encuentra tu Mascota es una app comunitaria chilena, "},
          {"texto":"gratuita y sin publicidad","fuerte":true},
          {"texto":", para publicar y encontrar reportes de mascotas perdidas y encontradas. La opera "},
          {"texto":"Pablo Espinoza","fuerte":true},
          {"texto":", persona natural domiciliada en Chile (RUT o razón social aún por definir)."}
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "Al usar la app aceptas estos términos. Si no estás de acuerdo, no la uses — y si ya tienes cuenta, puedes borrarla desde Perfil → Borrar mi cuenta."
          }
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"Qué es la app:","fuerte":true},
          {
            "texto": " un tablón de anuncios de barrio, digital. Publicamos lo que tú escribes y se lo mostramos a la gente que está cerca."
          }
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"Qué NO es la app:","fuerte":true},
          {
            "texto": " no somos un refugio, ni una veterinaria, ni una empresa de búsqueda, ni un servicio de rescate, ni una tienda, ni un intermediario de pagos. No verificamos que los reportes sean ciertos, no verificamos la identidad de nadie y no garantizamos que vayas a encontrar a tu mascota."
          }
        ]
      },
      {"tipo":"separador"},
      {"tipo":"titulo","nivel":2,"id":"2-edad-minima","texto":[{"texto":"2. Edad mínima"}]},
      {
        "tipo": "parrafo",
        "texto": [{"texto":"Tienes que tener 14 años cumplidos para crearte una cuenta.","fuerte":true}]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "Al registrarte te pedimos tu fecha de nacimiento. Si tienes menos de 14, no se crea la cuenta, pero "
          },
          {"texto":"puedes seguir usando la app sin cuenta","fuerte":true},
          {
            "texto": ": ver todos los reportes, el mapa, las fotos y las pistas. Para publicar o escribirle a alguien, pídeselo a un adulto de tu casa."
          }
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "El porqué de esa edad y qué hacemos si nos avisan que un usuario es menor está explicado en la "
          },
          {"texto":"Política de privacidad, §7","fuerte":true},
          {"texto":"."}
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "Si nos enteramos de que quien está detrás de una cuenta tiene menos de 14 años, suspendemos esa cuenta y la eliminamos. No es un castigo: es que legalmente no podemos tratar sus datos sin la autorización de su madre, padre o tutor."
          }
        ]
      },
      {"tipo":"separador"},
      {"tipo":"titulo","nivel":2,"id":"3-tu-cuenta","texto":[{"texto":"3. Tu cuenta"}]},
      {
        "tipo": "lista",
        "ordenada": false,
        "inicio": 1,
        "items": [
          [
            {"texto":"Un correo real y una contraseña que no uses en otro lado.","fuerte":true},
            {"texto":" Tú eres responsable de cuidarla."}
          ],
          [
            {"texto":"Los datos que pones tienen que ser tuyos y verdaderos.","fuerte":true},
            {
              "texto": " No te hagas pasar por otra persona, por una organización, por una municipalidad ni por una veterinaria."
            }
          ],
          [
            {"texto":"Una persona, una cuenta.","fuerte":true},
            {
              "texto": " No crees cuentas múltiples para inflar reportes, esquivar una suspensión o simular que varias personas vieron a la misma mascota."
            }
          ],
          [
            {"texto":"Si sospechas que alguien entró a tu cuenta, "},
            {"texto":"cambia la contraseña de inmediato","fuerte":true},
            {"texto":"."}
          ]
        ]
      },
      {"tipo":"separador"},
      {
        "tipo": "titulo",
        "nivel": 2,
        "id": "4-lo-que-publicas-es-tuyo-y-sigue-siendo-tuyo",
        "texto": [{"texto":"4. Lo que publicas es tuyo, y sigue siendo tuyo"}]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"Las fotos y los textos que subes "},
          {"texto":"siguen siendo tuyos","fuerte":true},
          {"texto":". No nos quedamos con la propiedad de nada."}
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"Lo que sí nos das es un "},
          {"texto":"permiso limitado y gratuito","fuerte":true},
          {
            "texto": " para mostrar ese contenido dentro de la app y del sitio web, y en las vistas públicas de los reportes (incluidas las previsualizaciones cuando alguien comparte un enlace y el afiche imprimible que tú generas). Ese permiso existe solo para que la app funcione y "
          },
          {"texto":"termina cuando borras el contenido o tu cuenta","fuerte":true},
          {
            "texto": ", salvo lo que ya se explicó en la Política de privacidad §5 sobre pistas y mensajes anonimizados, que sobreviven sin tu nombre porque también son de otra persona."
          }
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "Solo publica contenido que sea tuyo o que tengas derecho a publicar. Si subes una foto que sacó otra persona, tienes que tener su permiso."
          }
        ]
      },
      {"tipo":"separador"},
      {
        "tipo": "titulo",
        "nivel": 2,
        "id": "5-conductas-y-contenido-prohibidos",
        "texto": [{"texto":"5. Conductas y contenido prohibidos"}]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "Esta lista es explícita a propósito. Publicar cualquiera de estas cosas es motivo de retiro del contenido y, según la gravedad y la reincidencia, de suspensión o eliminación de la cuenta."
          }
        ]
      },
      {"tipo":"titulo","nivel":3,"id":"5-1-sobre-animales","texto":[{"texto":"5.1 Sobre animales"}]},
      {
        "tipo": "lista",
        "ordenada": true,
        "inicio": 1,
        "items": [
          [
            {
              "texto": "Vender, ofrecer en venta, permutar, arrendar, rifar, sortear o subastar animales.",
              "fuerte": true
            },
            {"texto":" Sin excepciones y sin importar el precio."}
          ],
          [
            {"texto":"Ofrecer animales en adopción a cambio de dinero","fuerte":true},
            {
              "texto": ", o pedir \"colaboración\", \"aporte\" o \"gastos\" como condición para entregar un animal. Adopción responsable significa gratis."
            }
          ],
          [
            {
              "texto": "Promocionar criaderos, camadas, montas, cruzas o servicios reproductivos.",
              "fuerte": true
            }
          ],
          [
            {"texto":"Publicar contenido que muestre "},
            {"texto":"maltrato, crueldad, peleas de animales, caza o tortura","fuerte":true},
            {
              "texto": ", salvo que sea material que estés denunciando y con el que nos estés pidiendo ayuda."
            }
          ],
          [
            {"texto":"Publicar como perdido un animal que no es tuyo ni está a tu cuidado","fuerte":true},
            {"texto":", o publicar como encontrado un animal que no has visto, para atraer contactos."}
          ],
          [
            {"texto":"Usar la app para "},
            {"texto":"quedarte con un animal ajeno","fuerte":true},
            {"texto":": retenerlo, esconderlo, o exigir dinero a su familia para devolverlo."}
          ]
        ]
      },
      {
        "tipo": "nota",
        "bloques": [
          {
            "tipo": "parrafo",
            "texto": [
              {"texto":"Por qué la regla 1 es tajante:","fuerte":true},
              {
                "texto": " en Chile la comercialización de mascotas está bajo escrutinio legislativo y hay un proyecto de ley en curso sobre comercialización ilegal. Además, una app de mascotas perdidas es un imán natural para revendedores. Preferimos una regla clarísima y aburrida a un caso por caso que nadie entiende."
              }
            ]
          }
        ]
      },
      {
        "tipo": "titulo",
        "nivel": 3,
        "id": "5-2-sobre-el-dinero-y-las-estafas",
        "texto": [{"texto":"5.2 Sobre el dinero y las estafas"}]
      },
      {
        "tipo": "lista",
        "ordenada": true,
        "inicio": 7,
        "items": [
          [
            {
              "texto": "Pedir una transferencia, un depósito, una recarga o un pago por adelantado",
              "fuerte": true
            },
            {"texto":" a cambio de devolver o de \"ubicar\" una mascota."}
          ],
          [
            {"texto":"Decir que tienes a una mascota que no tienes","fuerte":true},
            {"texto":", o mandar fotos ajenas para hacerte pasar por quien la encontró."}
          ],
          [
            {"texto":"Pedir "},
            {"texto":"datos bancarios, claves, códigos de verificación o de tarjetas","fuerte":true},
            {"texto":" a otro usuario, por cualquier motivo."}
          ],
          [
            {"texto":"Mandar "},
            {
              "texto": "enlaces de pago, códigos QR de cobro o enlaces a \"seguimientos\", \"encomiendas\" o \"trámites\"",
              "fuerte": true
            },
            {"texto":" que haya que pagar."}
          ],
          [
            {"texto":"Ofrecer "},
            {
              "texto": "servicios pagados de búsqueda, videncia, rastreo, \"detección por satélite\"",
              "fuerte": true
            },
            {"texto":" o similares."}
          ]
        ]
      },
      {
        "tipo": "titulo",
        "nivel": 3,
        "id": "5-3-sobre-otras-personas",
        "texto": [{"texto":"5.3 Sobre otras personas"}]
      },
      {
        "tipo": "lista",
        "ordenada": true,
        "inicio": 12,
        "items": [
          [
            {"texto":"Acosar, amenazar, intimidar o insultar","fuerte":true},
            {"texto":" a otro usuario, acá o fuera de la app a partir de un contacto hecho acá."}
          ],
          [
            {"texto":"Publicar datos personales de terceros sin su permiso","fuerte":true},
            {
              "texto": ": teléfono, dirección, patente, lugar de trabajo, RUT, fotos de su casa o de su cara."
            }
          ],
          [
            {"texto":"Contenido de odio","fuerte":true},
            {
              "texto": " por origen, nacionalidad, etnia, religión, sexo, orientación sexual, identidad de género, edad o discapacidad."
            }
          ],
          [
            {"texto":"Contenido sexual, sexualmente explícito o violento gráfico","fuerte":true},
            {"texto":" de cualquier tipo."}
          ],
          [
            {"texto":"Cualquier contenido que involucre a menores de edad","fuerte":true},
            {
              "texto": " de forma sexualizada o que los ponga en riesgo. Esto no tiene advertencia previa: se retira, se elimina la cuenta y se denuncia a la autoridad."
            }
          ],
          [
            {"texto":"Suplantar","fuerte":true},
            {"texto":" a otra persona, a una organización, a una autoridad o al equipo de la app."}
          ]
        ]
      },
      {
        "tipo": "titulo",
        "nivel": 3,
        "id": "5-4-sobre-el-uso-de-la-plataforma",
        "texto": [{"texto":"5.4 Sobre el uso de la plataforma"}]
      },
      {
        "tipo": "lista",
        "ordenada": true,
        "inicio": 18,
        "items": [
          [
            {"texto":"Spam, publicidad, promoción comercial","fuerte":true},
            {"texto":" de cualquier producto o servicio, o mensajes masivos."}
          ],
          [
            {"texto":"Reportes falsos, duplicados o de prueba","fuerte":true},
            {"texto":" publicados a propósito."}
          ],
          [
            {"texto":"Denunciar en falso","fuerte":true},
            {"texto":" para hacer bajar el reporte de otra persona."}
          ],
          [
            {"texto":"Usar "},
            {"texto":"bots, scrapers o automatizaciones","fuerte":true},
            {"texto":" para publicar, extraer datos masivamente o saturar el servicio."}
          ],
          [
            {"texto":"Intentar "},
            {
              "texto": "saltarse los límites de la app, acceder a datos de otros usuarios, o atacar la infraestructura",
              "fuerte": true
            },
            {
              "texto": ". Si encuentras una falla de seguridad, avísanos en vez de explotarla: lo vamos a agradecer de verdad."
            }
          ],
          [
            {"texto":"Publicar "},
            {"texto":"enlaces a malware, phishing o descargas engañosas","fuerte":true},
            {"texto":"."}
          ],
          [
            {"texto":"Reutilizar el contenido de la app para armar "},
            {"texto":"otro servicio, base de datos o directorio","fuerte":true},
            {"texto":"."}
          ],
          [{"texto":"Cualquier uso "},{"texto":"contrario a la ley chilena","fuerte":true},{"texto":"."}]
        ]
      },
      {"tipo":"separador"},
      {
        "tipo": "titulo",
        "nivel": 2,
        "id": "6-recompensas-lee-esto-con-atencion",
        "texto": [{"texto":"6. Recompensas: lee esto con atención"}]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"Un reporte puede mencionar una recompensa en dinero. Eso es "},
          {"texto":"solo información que publica el dueño de la mascota","fuerte":true},
          {"texto":"."}
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "La app no cobra, no paga, no retiene, no procesa, no garantiza y no media en ninguna recompensa.",
            "fuerte": true
          },
          {
            "texto": " No hay pasarela de pagos, no hay billetera, no hay custodia de dinero. Nunca pasa un peso por acá. El acuerdo, la entrega y el pago son "
          },
          {"texto":"exclusivamente entre las dos personas involucradas","fuerte":true},
          {"texto":", fuera de la app."}
        ]
      },
      {"tipo":"parrafo","texto":[{"texto":"Eso significa que:"}]},
      {
        "tipo": "lista",
        "ordenada": false,
        "inicio": 1,
        "items": [
          [
            {"texto":"Si alguien te promete una recompensa y no te la paga, "},
            {"texto":"nosotros no podemos hacer nada al respecto","fuerte":true},
            {"texto":". No tenemos el dinero ni forma de retenerlo."}
          ],
          [
            {"texto":"Si te piden que pagues antes de ver a la mascota, "},
            {"texto":"es una estafa","fuerte":true},
            {"texto":". No hay ninguna excepción legítima a esta regla."}
          ]
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [{"texto":"Recomendaciones concretas, que valen más que cualquier cláusula:","fuerte":true}]
      },
      {
        "tipo": "lista",
        "ordenada": false,
        "inicio": 1,
        "items": [
          [
            {"texto":"Nunca transfieras antes de ver a la mascota en persona.","fuerte":true},
            {"texto":" Nadie honesto pide plata por adelantado."}
          ],
          [
            {"texto":"Júntate en un lugar público y de día","fuerte":true},
            {"texto":", y anda acompañado."}
          ],
          [
            {
              "texto": "Pídele a quien dice tener a tu mascota una foto nueva con algo específico",
              "fuerte": true
            },
            {"texto":" (con un diario del día, o mostrando una marca o cicatriz que solo tú conoces)."}
          ],
          [
            {"texto":"No mandes tus datos bancarios por el chat","fuerte":true},
            {"texto":", ni siquiera si la conversación parece normal."}
          ],
          [
            {"texto":"Si algo huele mal, "},
            {"texto":"denúncialo desde la app","fuerte":true},
            {
              "texto": " y, si hay delito, haz la denuncia en Carabineros o en la PDI. Si nos lo pides, colaboramos con la información que tengamos."
            }
          ]
        ]
      },
      {"tipo":"separador"},
      {
        "tipo": "titulo",
        "nivel": 2,
        "id": "7-moderacion-que-hacemos-cuando-algo-esta-mal",
        "texto": [{"texto":"7. Moderación: qué hacemos cuando algo está mal"}]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "No revisamos previamente todo lo que se publica —no somos un medio con línea editorial, y no elegimos ni destacamos reportes—, pero "
          },
          {"texto":"sí actuamos cuando nos avisan o cuando lo detectamos","fuerte":true},
          {"texto":"."}
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"Cómo denunciar:","fuerte":true},
          {"texto":" hay un botón de denuncia en los reportes, en los perfiles y dentro del chat."}
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"Nuestros compromisos de tiempo","fuerte":true},
          {"texto":" — esto es lo que efectivamente nos obliga, así que está escrito en serio:"}
        ]
      },
      {
        "tipo": "tabla",
        "columnas": [[{"texto":"Tipo de denuncia"}],[{"texto":"Qué hacemos"}],[{"texto":"Cuándo"}]],
        "filas": [
          [
            [{"texto":"Contenido con menores en riesgo, amenazas creíbles a una persona o a un animal"}],
            [{"texto":"Retiro inmediato, eliminación de la cuenta y denuncia a la autoridad"}],
            [{"texto":"Apenas lo veamos","fuerte":true},{"texto":", prioridad máxima"}]
          ],
          [
            [{"texto":"Estafa en curso, suplantación, acoso"}],
            [{"texto":"Revisamos y retiramos si corresponde"}],
            [{"texto":"Dentro de "},{"texto":"24 horas","fuerte":true}]
          ],
          [
            [{"texto":"Venta de animales, spam, publicidad, reporte falso"}],
            [{"texto":"Revisamos y retiramos si corresponde"}],
            [{"texto":"Dentro de "},{"texto":"72 horas","fuerte":true}]
          ],
          [
            [{"texto":"Todo lo demás"}],
            [{"texto":"Revisamos"}],
            [{"texto":"Dentro de "},{"texto":"7 días","fuerte":true}]
          ]
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"Cada retiro y cada suspensión queda "},
          {"texto":"registrada con fecha y motivo","fuerte":true},
          {
            "texto": ". Eso no es burocracia: es la prueba de que actuamos con diligencia cuando nos notificaron."
          }
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"Qué puede pasar con el contenido o con la cuenta","fuerte":true},
          {"texto":", según la gravedad y la reincidencia:"}
        ]
      },
      {
        "tipo": "lista",
        "ordenada": true,
        "inicio": 1,
        "items": [
          [{"texto":"Retiro del contenido.","fuerte":true},{"texto":" Deja de verse en la app."}],
          [{"texto":"Advertencia.","fuerte":true}],
          [
            {"texto":"Suspensión temporal","fuerte":true},
            {"texto":" (no puedes publicar ni escribir, pero tu cuenta y tus datos siguen ahí)."}
          ],
          [
            {"texto":"Eliminación de la cuenta.","fuerte":true},
            {
              "texto": " Se aplica el mismo procedimiento del §5 de la Política de privacidad: se borra lo tuyo y sobrevive anonimizado lo que también es de otro."
            }
          ]
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "Vamos por los pasos 1 y 2 cuando parece un malentendido o un descuido, y directo al 4 en los casos graves (el punto 16 de la lista, estafas confirmadas, reincidencia después de una suspensión, o venta de animales después de una advertencia)."
          }
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"Quién decide.","fuerte":true},
          {"texto":" Cada una de estas medidas la revisa y la toma "},
          {"texto":"una persona","fuerte":true},
          {
            "texto": ": no hay un algoritmo que retire contenido ni suspenda cuentas por su cuenta. Y como cada medida queda registrada con fecha y motivo, siempre se puede volver sobre ella."
          }
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"Una suspensión no es definitiva.","fuerte":true},
          {
            "texto": " Se puede levantar, y al levantarla la cuenta vuelve a publicar y a escribir con su contenido y su historial intactos: mientras está suspendida no se borra nada tuyo."
          }
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"Cómo te enteras: dentro de la app, no por correo.","fuerte":true},
          {
            "texto": " Hoy no te mandamos un correo cuando retiramos algo o cuando suspendemos una cuenta. Lo vas a notar porque la publicación deja de aparecer, o porque al intentar publicar la app te dice que tu cuenta está suspendida. Preferimos decirlo así, aunque quede feo, antes que prometerte un aviso que hoy no sale de ninguna parte."
          }
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"Si crees que nos equivocamos","fuerte":true},
          {
            "texto": ", nada de esto te quita derechos: puedes reclamar por las vías que la ley te da, y del daño que causemos por nuestra propia culpa respondemos (§8). Para reclamárnoslo directamente a nosotros:"
          }
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "Todavía no publicamos un correo de contacto, y preferimos no prometerte un canal que hoy no atenderíamos. Mientras tanto, lo que puedes resolver por tu cuenta está en la app: Perfil → Editar perfil, Perfil → Avisos y Perfil → Borrar mi cuenta. Habrá un correo publicado antes de que la app llegue a App Store y Google Play, porque ambas tiendas lo exigen."
          }
        ]
      },
      {"tipo":"separador"},
      {
        "tipo": "titulo",
        "nivel": 2,
        "id": "8-de-que-respondemos-y-de-que-no",
        "texto": [{"texto":"8. De qué respondemos y de qué no"}]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "Acá no vas a encontrar el párrafo en mayúsculas donde la app se exime de todo. Ese párrafo, además de ser desagradable, "
          },
          {"texto":"no serviría","fuerte":true},
          {
            "texto": ": en Chile las cláusulas que eximen anticipadamente de toda responsabilidad al proveedor son nulas. Así que vamos a decir la verdad, que es más útil para los dos."
          }
        ]
      },
      {"tipo":"parrafo","texto":[{"texto":"De lo que sí respondemos:","fuerte":true}]},
      {
        "tipo": "lista",
        "ordenada": false,
        "inicio": 1,
        "items": [
          [
            {
              "texto": "De operar la app con el cuidado razonable que se le puede pedir a un servicio gratuito hecho por una persona."
            }
          ],
          [
            {
              "texto": "De proteger tus datos como está descrito en la Política de privacidad, y de que lo que ahí decimos sea "
            },
            {"texto":"cierto","fuerte":true},
            {"texto":"."}
          ],
          [
            {"texto":"De "},
            {"texto":"actuar con rapidez cuando nos avisas","fuerte":true},
            {"texto":" de contenido o conductas que rompen estas reglas, en los plazos del §7."}
          ],
          [{"texto":"De responder tus solicitudes sobre tus datos en los plazos comprometidos."}],
          [
            {
              "texto": "Del daño que causemos por nuestra propia culpa o dolo. Eso no se puede renunciar, y no pretendemos que renuncies."
            }
          ]
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [{"texto":"De lo que no podemos responder, porque no está en nuestras manos:","fuerte":true}]
      },
      {
        "tipo": "lista",
        "ordenada": false,
        "inicio": 1,
        "items": [
          [
            {"texto":"De "},
            {"texto":"lo que publiquen o hagan otros usuarios","fuerte":true},
            {
              "texto": ". No verificamos la veracidad de los reportes ni la identidad de las personas, y así está dicho desde el §1."
            }
          ],
          [
            {"texto":"De lo que pase "},
            {"texto":"en un encuentro presencial","fuerte":true},
            {"texto":" entre dos usuarios, o de un acuerdo de recompensa que se cierra fuera de la app."}
          ],
          [
            {"texto":"De que "},
            {"texto":"encuentres a tu mascota","fuerte":true},
            {"texto":". Ojalá, pero esta app es una herramienta, no una promesa."}
          ],
          [
            {
              "texto": "De caídas o interrupciones del servicio, especialmente las que dependen de terceros (Supabase, el hosting, el proveedor de correo, las tiendas de apps). Es un servicio gratuito y no hay garantía de disponibilidad continua."
            }
          ],
          [
            {
              "texto": "De que un aviso llegue a tiempo, o llegue. El correo y el push dependen de tu proveedor de correo, de tu teléfono y de tus permisos."
            }
          ]
        ]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "Si algo de esto te causa un problema, dínoslo igual por el canal de contacto (§12). Preferimos conversarlo a que te quedes con un mal rato."
          }
        ]
      },
      {"tipo":"separador"},
      {
        "tipo": "titulo",
        "nivel": 2,
        "id": "9-interrupcion-y-termino-del-servicio",
        "texto": [{"texto":"9. Interrupción y término del servicio"}]
      },
      {
        "tipo": "lista",
        "ordenada": false,
        "inicio": 1,
        "items": [
          [
            {"texto":"Tú puedes irte cuando quieras:","fuerte":true},
            {"texto":" Perfil → Borrar mi cuenta, o simplemente dejar de usar la app."}
          ],
          [
            {"texto":"Nosotros podemos cambiar o discontinuar funciones","fuerte":true},
            {"texto":", y podríamos tener que cerrar la app. Si eso pasara, avisaríamos "},
            {"texto":"con al menos 30 días de anticipación","fuerte":true},
            {
              "texto": " dentro de la app y por correo, para que tengas tiempo de guardar lo que necesites y de pedirnos tus datos."
            }
          ],
          [
            {"texto":"Si suspendemos tu cuenta","fuerte":true},
            {
              "texto": " por incumplir estos términos, dejas de poder publicar y escribir, y el contenido que rompía las reglas queda retirado; tu cuenta y tus datos siguen ahí, y la suspensión se puede levantar. "
            },
            {"texto":"Si la eliminamos","fuerte":true},
            {
              "texto": ", se aplica el procedimiento de borrado del §5 de la Política de privacidad. En ninguno de los dos casos te llega hoy un correo avisándote: el §7 cuenta cómo te enteras y qué te podemos y qué no te podemos prometer al respecto."
            }
          ]
        ]
      },
      {"tipo":"separador"},
      {
        "tipo": "titulo",
        "nivel": 2,
        "id": "10-cambios-a-estos-terminos",
        "texto": [{"texto":"10. Cambios a estos términos"}]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "Si cambian, actualizamos la fecha y la versión de arriba. Si el cambio es importante, te avisamos dentro de la app "
          },
          {"texto":"antes","fuerte":true},
          {
            "texto": " de que empiece a aplicarse. Seguir usando la app después de eso significa que aceptas la versión nueva; si no la aceptas, puedes borrar tu cuenta."
          }
        ]
      },
      {"tipo":"separador"},
      {
        "tipo": "titulo",
        "nivel": 2,
        "id": "11-ley-aplicable-y-tribunales",
        "texto": [{"texto":"11. Ley aplicable y tribunales"}]
      },
      {
        "tipo": "parrafo",
        "texto": [
          {"texto":"Estos términos se rigen por la "},
          {"texto":"ley chilena","fuerte":true},
          {"texto":". Cualquier conflicto lo ven los "},
          {"texto":"tribunales ordinarios de justicia de Chile","fuerte":true},
          {
            "texto": ", sin renunciar a los derechos que te correspondan como titular de datos personales ante la Agencia de Protección de Datos Personales."
          }
        ]
      },
      {"tipo":"separador"},
      {"tipo":"titulo","nivel":2,"id":"12-contacto","texto":[{"texto":"12. Contacto"}]},
      {
        "tipo": "parrafo",
        "texto": [
          {
            "texto": "Todavía no publicamos un correo de contacto, y preferimos no prometerte un canal que hoy no atenderíamos. Mientras tanto, lo que puedes resolver por tu cuenta está en la app: Perfil → Editar perfil, Perfil → Avisos y Perfil → Borrar mi cuenta. Habrá un correo publicado antes de que la app llegue a App Store y Google Play, porque ambas tiendas lo exigen."
          }
        ]
      }
    ]
  }
];
