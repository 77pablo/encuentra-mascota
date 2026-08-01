# Qué hace el rubro que nosotros no — investigación del 1-ago-2026

Insumo para las próximas tandas. **No se implementó nada de acá todavía.**

⚠️ Antes de usar cualquier número de este documento, leé la sección final. Casi todas las cifras de
"mascotas reunidas" del rubro son **autodeclaradas y sin auditar**, y el estudio que ordena el
análisis es estadounidense de 2012.

---

## 1. El hallazgo que reordena el producto

Encuesta nacional ASPCA (Weiss et al., *Animals* 2012) — **cómo se recuperan realmente** las
mascotas:

| Método | Perros | Gatos |
|---|---|---|
| **Búsqueda física del vecindario** | **49%** | 30% |
| Volvió sola a casa | 13-29% | **59%** |
| Chapita o microchip | 15% | 2% |
| Refugio / control animal | 6% | 2% |

Distancias medidas (U. de Queensland + Missing Animal Response, 2017, n=1.232 gatos): mediana de
**315 m** para gatos con acceso al exterior, **50 m** para gatos de interior escapados. Mediana de
tiempo hasta recuperarla: **2 días perros, 5 días gatos**.

**Lo que significa para nosotros:** somos buenos como base de datos y red de avisos, y la base de
datos resuelve el 2-6% de los casos. Lo que resuelve el 30-49% es **la búsqueda física del barrio en
las primeras 48 horas**, y ahí no tenemos casi nada. Ese es el hueco grande del producto — no el
reconocimiento facial.

## 2. Chile: el competidor real no es una app de mascotas

- **SOSAFE** — ~2,5 millones de usuarios y convenios con ~27 comunas *pagados por los municipios*.
  Ya tiene "Mascota perdida" con alerta georreferenciada a 500 m fijos, y vende **SAFE Tag**, una
  placa QR que funciona sin que quien la encuentre tenga la app (requiere Premium). **No podemos
  ganarle en densidad.**
- **Dogin.cl** — el competidor directo más vivo: mapa público, push, QR gratis, adopciones, 8+
  ciudades.
- **buscomimascota.cl** — gratis, 16 regiones, **1 aviso activo**. Es la prueba viva de que sin
  densidad no hay producto.
- **PetMatch.cl** — 160+ refugios, contacto por WhatsApp, **sin función de perdidos**. Socio
  potencial, no competidor.
- **Municipios** — Santiago publica "Mascotas Perdidas" con 21 avisos, el último de **feb-2024**.
  Están abandonados: el pitch no es competir, es hacernos cargo gratis.
- **Microchip fragmentado** — la Ley 21.020 obliga a inscribir con chip, pero conviven al menos
  **seis registros chilenos sin consulta unificada**. Nadie hizo el agregador.
- **Ley 21.020**: obliga a avisar a la municipalidad **dentro de 3 días corridos** ante una pérdida.
  Casi nadie lo sabe.
- **Robo de mascotas**: 1.684 registradas por Subdere entre 2018 y sept-2025; proyecto de ley de
  oct-2025 para tipificarlo. Hoy no es figura penal especial.

## 3. Reconocimiento facial y de hocico: qué es real

**Decisión tomada: no se implementa como función estrella.** Ver el spec de la tanda 9.

- **Estado del mercado:** Finding Rover fue adquirido en 2020, **Shadow cerró en 2021**. Quedó Petco
  Love Lost dominando. Su mejor dato verificable: en Pinellas County, **50% de retorno con el sistema
  vs 40% normal** — diez puntos, no una revolución.
- **Cara:** paper de jun-2026, en perros **96,85% de verificación pero solo 84,34% de
  identificación**, y **se degrada con desenfoque de movimiento, poses raras y baja resolución** —
  o sea, las condiciones exactas de una foto de celular ([arXiv 2606.09353](https://arxiv.org/abs/2606.09353)).
- **Hocico:** el "99%" de Petnow sale de IEEE Access 2021 (98,972% Rank-1), un paper cuyos **datos
  aportó Petnow y cuyo coautor es el CTO de Petnow**. El único benchmark sin el proveedor adentro es
  el Pet Biometric Challenge del CVPR 2022, donde el 3er puesto reporta **86,67% AUC**
  ([arXiv:2205.15934](https://arxiv.org/abs/2205.15934)). *Aviso metodológico: AUC de verificación y
  Rank-1 de identificación son métricas distintas y no se restan entre sí; el punto es que el único
  resultado sin conflicto de interés queda muy lejos del marketing.*
- **Costo: dejó de ser la objeción.** Con 50.000 fotos indexadas y 2.000 búsquedas diarias, el
  cómputo son 1,31 horas mensuales: **US$6-24/mes** autohospedado (DINOv2-Small, ONNX INT8) sobre
  infraestructura que ya tenemos.
- **Tres trampas caras:** GPU serverless **no** ahorra con nuestro patrón de tráfico (una petición
  cada ~35 s mantiene los contenedores calientes 24/7); **AWS Rekognition no sirve** (su búsqueda
  facial es solo de humanos); y **el límite de pgvector es la RAM, no las filas** — 384 dims dan
  ~100k vectores, 768 dims la mitad, lo que decide usar el modelo chico. Con inserciones continuas va
  HNSW, no IVFFlat.

**Conclusión:** implementable y barato, pero con ~84% de identificación **no sirve como coincidencia
automática**. Solo como **re-ranking** de candidatos que ya pasaron el filtro de zona y fecha, dicho
como *"se parecen, fijate vos"*. Un falso positivo acá es crueldad con alguien desesperado.

## 4. Las tres oportunidades más fuertes

### 🥇 "Cuadrilla": organizar la búsqueda física del barrio
Invitar por link de WhatsApp a familia y vecinos; cada uno recibe **tareas concretas** (pegar
carteles en tal esquina, recorrer estas 4 cuadras, avisar a estas 3 veterinarias) y marca cuando
terminó. Mapa de qué se recorrió ya.
*Por qué:* es la única función que ataca el mecanismo que resuelve el 30-49%. Petco lanzó lo mismo en
2025 diciendo que **el 75% de los tutores tiene ayuda pero no logra organizarla**. Y de yapa: cada
ayudante invitado es un usuario nuevo **del barrio correcto**, que es justo nuestro problema de
arranque en frío.
*Contra:* si nadie acepta, queda una pantalla vacía que se siente peor que no tenerla. Tiene que
funcionar bien con dos ayudantes.

### 🥈 Plan de acción por horas, por especie, con radio calibrado
Al publicar se genera un plan con reloj ("primeras 2 horas", "hoy antes de que oscurezca", "día 2"),
**distinto** para perro sociable, perro asustadizo, gato de interior y gato con exterior. Y el radio
de alerta deja de ser fijo: **50-150 m para un gato de interior, 300-500 m para uno con exterior,
1-2 km para un perro**, ampliando con el tiempo.
*Por qué:* es lo más barato de construir y lo más respaldado por evidencia. Lost Dogs of America
recuperó 75.000 perros mandando planes personalizados **sin ninguna app**. Y SOSAFE usa 500 m fijos,
que para un gato de interior es diez veces demasiado.
*Contra:* hay que redactarlo con criterio rescatista real o queda en palabrería. Validar con una
fundación chilena.

### 🥉 Cuentas institucionales: veterinarias, refugios y municipios
Rol distinto con panel para publicar en lote, y **widget embebible** para que una veterinaria o un
municipio muestre "mascotas perdidas de la comuna" en su propio sitio, alimentado por nosotros.
*Por qué:* es cómo Petco Love Lost consiguió escala, y es la única defensa realista contra SOSAFE. No
podemos ganarle en densidad, pero sí ser la infraestructura que adoptan **porque es gratis y lo suyo
está abandonado**.
*Contra:* vender a municipios es lento y político. Empezar por veterinarias, que deciden en un día, y
usar eso como prueba.

## 5. Otras oportunidades registradas

- **Carteles neón + alertas de intersección.** Los carteles grandes fluorescentes captan a los
  conductores y los papelitos blancos no: **14 de 43 familias entrenadas recuperaron su perro así**.
  Sugerir las 4-6 intersecciones de más tráfico. *Ojo: varias comunas multan pegar carteles en
  postes; hay que advertirlo.*
- **Consultor de microchip chileno** — dónde escanear gratis cerca y ruteo a los seis registros. Con
  chip los perros vuelven 52,2% vs 21,9%; los gatos ~38% vs ~2%.
- **Canal para quien encuentra, sin app ni cuenta.** El que encuentra al perro es un desconocido sin
  ninguna razón para instalar nada. PetHub construyó su producto entero sobre esto.
- **Antiestafa integrada:** guardar 1-2 señas en privado para verificar a quien llame, advertencia
  automática si alguien pide dinero por adelantado, y **no publicar el monto de la recompensa** (FBI
  y BBB tienen alertas activas, incluida la variante con imágenes generadas por IA).
- **Cierre de casos:** preguntar "¿apareció?" a los 3, 7 y 21 días. Los avisos zombis son el defecto
  estructural del rubro. Genera además el dato que **nadie tiene en Chile**: cuántas se reencuentran
  de verdad — material de prensa y de convenio municipal. *El tono importa muchísimo: preguntar
  "¿apareció?" a quien no la encontró duele.*
- **Kit de captura** (estación de alimentación, cámara trampa) y sobre todo **no perseguir, no
  llamar, no mirar a los ojos**: perseguir a un perro asustado lo aleja del punto de pérdida.
- **Tipo de reporte "robada"**, separado de "perdida", con guía propia.

## 6. Lo que NO hay que copiar

| Qué | Por qué |
|---|---|
| **Paywall / impulso pagado** (PawBoost Premium, PetRadar US$39) | Rompe la promesa de gratis. La crítica más sólida acusa a PawBoost de atribuirse reuniones sin poder demostrar causalidad |
| **Llamadas telefónicas masivas** (PetAmberAlert, FindToto) | BBB rating **F**, denuncias de cobros sin servicio, llamadas de madrugada que enojan al barrio |
| **Drones térmicos** | No ven a través de objetos sólidos, sirven poco con calor, inútiles en zonas pobladas. ~US$2.500 el dron + ~US$8.000 la cámara + cuatro personas |
| **Reconocimiento facial/nasal como función estrella** | Ver sección 3 |
| **Recompensa con monto visible** | Atrae estafadores, incentiva perseguir al animal y habilita extorsión |
| **Rastreadores Bluetooth propios** | Inútiles donde hay pocos usuarios, o sea justo donde más se necesitan |
| **Notificaciones sin filtro** | Queja explícita y reconocida en PawBoost. Vía rápida a la desinstalación |
| **Directorio público de mascotas ligado a la dirección** (Nextdoor) | Con la Ley 21.719 desde dic-2026 y el robo de mascotas al alza, publicar "este perro vive en esta casa" es exponerse |

## 7. ⚠️ Qué NO está verificado

- **Todas las cifras de reuniones del rubro son autodeclaradas y sin auditar** (PawBoost 2,27M, Petco
  Love Lost 250.000, PetHub 96%). No son comparables entre sí.
- **El estudio ASPCA que ordena todo el análisis es de 2012 y estadounidense.** Que esas proporciones
  se trasladen a Chile es **inferencia, no dato chileno**.
- Los datos de SOSAFE sobre mascotas (600 reportes/mes, 4 de cada 10 reunidas) son **de 2018**.
- Los "19.500 usuarios" de Dogin salen de su propio sitio.
- **PetLoc, Fauna City y PeTrace quedaron sin investigar.** Tampoco se revisaron apps de Argentina,
  México, Colombia ni Brasil.
- **Cero reseñas reales de usuarios** de apps de reconocimiento facial: es el hueco más grande de la
  investigación.
- **"Qué hace que la gente vuelva" quedó flojo**: hay evidencia de por qué se van (notificaciones sin
  filtro, avisos zombis, estafas), no de qué los trae de vuelta.
- No existen públicamente benchmarks de retención D1/D7/D30 para apps de mascotas.
