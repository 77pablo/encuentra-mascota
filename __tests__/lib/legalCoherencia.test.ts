import { readFileSync } from 'fs';
import { join } from 'path';

// La pantalla legal de la app (LegalScreen) es la version corta de los
// documentos de `docs/legal/`. Si alguien cambia un compromiso en el documento
// y se olvida de la pantalla —o al reves— la app queda prometiendo una cosa
// distinta a la que dice el documento publicado. Este test lee los tres
// archivos como TEXTO y verifica que los compromisos concretos coincidan.
//
// No se renderiza el componente a proposito: LegalScreen importa el barrel
// `../ui`, que en jest arrastra @expo/vector-icons -> expo-font (ausente en
// node_modules).

const raiz = join(__dirname, '..', '..');
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8');

const pantalla = leer(join('src', 'screens', 'LegalScreen.tsx'));
const privacidad = leer(join('docs', 'legal', 'politica-privacidad.md'));
const terminos = leer(join('docs', 'legal', 'terminos-de-uso.md'));

describe('la pantalla legal no contradice a los documentos publicados', () => {
  // Cada entrada es un compromiso que, si cambia, tiene que cambiar en los dos
  // lados. El valor esta escrito aca a proposito: si alguien lo baja en un solo
  // archivo, el test falla en vez de dejar pasar la desincronizacion.
  const compromisos: Array<{ que: string; enPantalla: RegExp; enDoc: RegExp; doc: string }> = [
    {
      que: 'edad minima de 14 anios',
      enPantalla: /al menos 14 años|edad mínima para tener cuenta es 14 años/i,
      enDoc: /14 años/i,
      doc: 'privacidad',
    },
    {
      que: 'radio de difuminado de la ubicacion',
      enPantalla: /250\s*metros/i,
      enDoc: /250\s*(metros|m\b)/i,
      doc: 'privacidad',
    },
    {
      que: 'plazo maximo de respuesta a los derechos (30 dias)',
      enPantalla: /30 días corridos/i,
      enDoc: /30 días corridos/i,
      doc: 'privacidad',
    },
    {
      que: 'plazo de aviso de brechas (72 horas)',
      enPantalla: /72\s*horas/i,
      enDoc: /72\s*horas/i,
      doc: 'privacidad',
    },
    {
      que: 'aviso previo de 30 dias si se cierra el servicio',
      enPantalla: /30 días de anticipación/i,
      enDoc: /30 días de anticipación/i,
      doc: 'terminos',
    },
  ];

  it.each(compromisos)('$que aparece en la pantalla y en el documento', ({ enPantalla, enDoc, doc }) => {
    expect(pantalla).toMatch(enPantalla);
    expect(doc === 'privacidad' ? privacidad : terminos).toMatch(enDoc);
  });

  it('los plazos de moderacion de la pantalla son los mismos del documento', () => {
    for (const plazo of [/24 horas/i, /72 horas/i, /7 días/i]) {
      expect(pantalla).toMatch(plazo);
      expect(terminos).toMatch(plazo);
    }
  });
});

describe('la pantalla legal no filtra marcadores ni promesas vacias', () => {
  it('no muestra marcadores de redaccion pendiente', () => {
    // Los documentos SI tienen [[PENDIENTE: ...]] (son borradores internos);
    // la pantalla que ve el usuario, no.
    expect(pantalla).not.toMatch(/\[\[PENDIENTE/);
    expect(pantalla).not.toMatch(/\[tu correo/i);
  });

  it('no promete un correo de contacto mientras no exista', () => {
    const sinCorreo = /const CORREO_CONTACTO: string \| null = null;/.test(pantalla);
    if (!sinCorreo) return; // ya se definio un correo: la promesa es legitima
    // Con CORREO_CONTACTO en null, ningun texto puede decirle al usuario que
    // escriba a un correo: el unico "escríbenos a" vive dentro de la rama que
    // solo se renderiza cuando la constante tiene valor.
    const usos = pantalla.match(/escríbenos a/gi) ?? [];
    expect(usos).toHaveLength(1);
    expect(pantalla).toMatch(/escríbenos a \{CORREO_CONTACTO\}/);
  });

  it('el punto del chat ya no esta redactado como vigilancia', () => {
    // Redaccion vieja: "Los mensajes que envías y recibes en el chat de la app."
    // sin decir que no se leen. Sonaba a que guardamos todo para mirarlo.
    expect(pantalla).not.toMatch(/Los mensajes que envías y recibes en el chat de la app\./);
    expect(pantalla).toMatch(/No los leemos/);
  });
});
