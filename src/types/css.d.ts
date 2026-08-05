// Declaración ambiental mínima para los imports de CSS "por efecto"
// (`import 'leaflet/dist/leaflet.css'`). Metro/webpack los resuelven en
// tiempo de build; `tsc` sin esto no encuentra tipos para `.css` y rompe
// `--noEmit` aunque el bundle compile bien.
declare module '*.css';
