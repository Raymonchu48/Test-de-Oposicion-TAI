export interface MindMapNode {
  name: string;
  children?: MindMapNode[];
  description?: string;
}

export const TAI_SYLLABUS: MindMapNode = {
  name: "Temario TAI",
  children: [
    {
      name: "Bloque 1: Organización del Estado y Administración Electrónica",
      children: [
        { name: "1. La Constitución Española de 1978" },
        { name: "2. Las Cortes Generales. El Poder Judicial" },
        { name: "3. El Gobierno y la Administración. La AGE" },
        { name: "4. La Unión Europea. Instituciones y Derecho" },
        { name: "5. El personal funcionario y laboral" },
        { name: "6. Políticas de Igualdad y Violencia de Género" },
        { name: "7. Gobierno Abierto y Transparencia" },
        { name: "8. Protección de Datos Personales (RGPD/LOPDGDD)" },
        { name: "9. La Ley de Procedimiento Administrativo Común (39/2015)" },
        { name: "10. Régimen Jurídico del Sector Público (40/2015)" },
        { name: "11. La Administración Electrónica en España" }
      ]
    },
    {
      name: "Bloque 2: Tecnología Básica",
      children: [
        { name: "1. Conceptos de informática. Arquitectura de ordenadores" },
        { name: "2. Sistemas operativos: Conceptos y administración" },
        { name: "3. Windows: Arquitectura y administración" },
        { name: "4. Linux: Arquitectura y administración" },
        { name: "5. Virtualización y Cloud Computing" },
        { name: "6. Almacenamiento: DAS, NAS, SAN, Backup" },
        { name: "7. Gestión de servicios e infraestructuras (ITIL)" },
        { name: "8. Software de base y herramientas ofimáticas" },
        { name: "9. Accesibilidad y diseño para todos" },
        { name: "10. Calidad del software y métricas" }
      ]
    },
    {
      name: "Bloque 3: Desarrollo de Sistemas",
      children: [
        { name: "1. Metodologías de desarrollo. Ciclo de vida" },
        { name: "2. Análisis y diseño orientado a objetos (UML)" },
        { name: "3. Bases de datos: Conceptos, modelos y diseño" },
        { name: "4. Lenguaje SQL y administración de SGBD" },
        { name: "5. Lenguajes de programación: Java, .NET, Python" },
        { name: "6. Desarrollo Web: HTML, CSS, JS, Frameworks" },
        { name: "7. Servicios Web y arquitecturas SOA/Microservicios" },
        { name: "8. Herramientas de control de versiones (Git)" },
        { name: "9. Pruebas de software y mantenimiento" }
      ]
    },
    {
      name: "Bloque 4: Sistemas y Comunicaciones",
      children: [
        { name: "1. Modelo OSI y arquitectura TCP/IP" },
        { name: "2. Medios de transmisión y tecnologías de red" },
        { name: "3. Redes de área local (LAN) y WiFi" },
        { name: "4. Protocolos de red: IP, TCP, UDP, ICMP" },
        { name: "5. Servicios de red: DNS, DHCP, HTTP, SMTP" },
        { name: "6. Seguridad: Criptografía y firma electrónica" },
        { name: "7. Seguridad perimetral: Firewalls, IDS/IPS, VPN" },
        { name: "8. Gestión de identidades y control de acceso" },
        { name: "9. Esquema Nacional de Seguridad (ENS)" }
      ]
    }
  ]
};
