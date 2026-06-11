// Enfermería ve el mismo módulo de Notificación de Altas de Trabajo Social, pero
// en modo solo-lectura: la página oculta registrar/editar/borrar para todo rol que
// no sea trabajo_social (deja únicamente la tabla y el botón de imprimir reporte).
// Reutilizamos el componente para no duplicar la vista ni el reporte imprimible.
export { default } from "@/app/dashboard/notificacion-altas/page";
