import React from 'react';
import { Linkedin } from 'lucide-react'; // Si no usás lucide-react, podés cambiarlo por cualquier ícono de Redes
import gabi from "../../public/assets/img/team/gabi.jpg";
import emi from "../../public/assets/img/team/emiliano.jpeg";
import juan from "../../public/assets/img/team/juan2.jpg";
import pame from "../../public/assets/img/team/pame.jpg";


const Team = () => {
  // Objeto con la información de los miembros del equipo
  // Podés completar los links de las imágenes y perfiles cuando lo pases a producción
  const teamMembers = [
    {
      id: 1,
      name: "Gabi Vega",
      role: "Founder & Lead Developer",
      image: gabi, // Reemplazar por la URL de tu foto
      linkedin: "https://www.linkedin.com/in/gabivega/",
    },
    {
      id: 2,
      name: "Emiliano Aparicio",
      role: "Frontend Developer",
      image: emi, // Reemplazar por la URL de la foto de Emi
      linkedin: "https://www.linkedin.com/in/emiliano-aparicio-8b9757236/",
    },
    {
      id: 3,
      name: "Juan Jozami",
      role: "Marketing & Growth",
      image: juan, // Reemplazar por la URL de la foto de Juan
      linkedin: "https://www.linkedin.com/in/juan-jozami-ba7838226/",
    },
    {
      id: 4,
      name: "Pame Pugliotti",
      role: "Graphic Design",
      image: pame, // Reemplazar por la URL de la foto de Juan
      linkedin: "https://www.linkedin.com/in/pamela-pugliotti/",
    },
  ];

  return (
    <section className="bg-neutral-950 text-white py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto text-center">
        {/* Encabezado de la sección */}
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
          El equipo de <span className="text-[#FB6002]">Mercado Nero</span>
        </h2>
        <p className="text-neutral-400 max-w-2xl mx-auto mb-16 text-lg">
          Comprometidos en llevar el ecommerce de Latinoamérica al siguiente nivel.
        </p>

        {/* Grilla de miembros */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-12 justify-center">
          {teamMembers.map((member) => (
            <div 
              key={member.id} 
              className="flex flex-col items-center p-6 bg-neutral-900/40 rounded-2xl border border-neutral-800/50 backdrop-blur-sm"
            >
              {/* Contenedor de la Imagen con efecto B&W a Color */}
              <div className="relative w-36 h-36 rounded-full overflow-hidden mb-6 border-2 border-neutral-800 group cursor-pointer">
                <img
                  src={member.image}
                  alt={member.name}
                  className="w-full h-full object-cover grayscale transition-all duration-500 ease-in-out group-hover:grayscale-0 group-hover:scale-105"
                />
              </div>

              {/* Información del Miembro */}
              <h3 className="text-xl font-bold tracking-wide text-neutral-100">
                {member.name}
              </h3>
              <p className="text-sm font-medium text-neutral-400 mt-1 mb-4">
                {member.role}
              </p>

              {/* Enlace a LinkedIn */}
              <a
                href={member.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-500 hover:text-white transition-colors duration-300 p-2 rounded-full hover:bg-neutral-800/60"
                aria-label={`Perfil de LinkedIn de ${member.name}`}
              >
                <Linkedin className="w-5 h-5" />
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Team;