import { motion } from "framer-motion";
import { Linkedin, BookOpen } from "lucide-react";
import headshot from "@/assets/headshot.jpeg";

const Hero = () => {
  return (
    <section className="min-h-screen flex items-center justify-center px-6 pt-24 pb-16 relative overflow-hidden">
      {/* Gradient Glows */}
      <div 
        className="absolute top-0 right-0 w-[900px] h-[900px] md:w-[1200px] md:h-[1200px] rounded-full pointer-events-none -z-10"
        style={{
          background: 'radial-gradient(circle, #9FFF60 0%, transparent 70%)',
          opacity: 0.06,
          filter: 'blur(100px)',
          transform: 'translate(30%, -30%)'
        }}
      />
      <div 
        className="absolute bottom-0 left-0 w-[900px] h-[900px] md:w-[1100px] md:h-[1100px] rounded-full pointer-events-none -z-10"
        style={{
          background: 'radial-gradient(circle, #6AA6FF 0%, transparent 70%)',
          opacity: 0.05,
          filter: 'blur(120px)',
          transform: 'translate(-35%, 35%)'
        }}
      />
      
      {/* Abstract Rocket Line Art */}
      <svg 
        className="absolute top-1/2 left-1/2 w-[800px] h-[800px] pointer-events-none -z-10"
        style={{
          transform: 'translate(-20%, -50%) rotate(-15deg)',
          opacity: 0.07,
          mixBlendMode: 'overlay'
        }}
        viewBox="0 0 400 600"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Rocket body - elongated rounded triangle */}
        <path 
          d="M 200 50 Q 220 60, 220 100 L 220 400 Q 220 420, 200 430 Q 180 420, 180 400 L 180 100 Q 180 60, 200 50 Z" 
          stroke="#FFFFFF" 
          strokeWidth="1.5" 
          fill="none"
        />
        {/* Nose cone circle */}
        <circle 
          cx="200" 
          cy="50" 
          r="15" 
          stroke="#FFFFFF" 
          strokeWidth="1.5" 
          fill="none"
        />
        {/* Left fin */}
        <path 
          d="M 180 300 L 140 380 L 180 360 Z" 
          stroke="#FFFFFF" 
          strokeWidth="1.5" 
          fill="none"
        />
        {/* Right fin */}
        <path 
          d="M 220 300 L 260 380 L 220 360 Z" 
          stroke="#FFFFFF" 
          strokeWidth="1.5" 
          fill="none"
        />
        {/* Flame arc */}
        <path 
          d="M 180 430 Q 200 470, 220 430" 
          stroke="#FFFFFF" 
          strokeWidth="2" 
          fill="none"
        />
        <path 
          d="M 185 430 Q 200 455, 215 430" 
          stroke="#FFFFFF" 
          strokeWidth="1.5" 
          fill="none"
        />
      </svg>

      <div className="max-w-4xl mx-auto text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <img 
            src={headshot} 
            alt="Ini Karunwi" 
            className="w-40 h-40 rounded-full mx-auto object-cover border-4 border-primary shadow-2xl"
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <h1 className="text-5xl md:text-6xl font-bold mb-4">
            Hi, I'm <span className="text-primary">Ini Karunwi</span>.
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground mb-6">
            Product & Project Manager • No-Code Developer
          </p>
          
          <div className="max-w-3xl mx-auto mb-8 text-foreground/90 leading-relaxed">
            <p className="mb-4">
              Experienced PM (5+ years). Helped scale{" "}
              <a href="https://welovenocode.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                WeLoveNoCode
              </a>{" "}
              from $500k → $3M ARR. Founding member of{" "}
              <a href="https://proptechbuzz.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                ProptechBuzz.com
              </a>{" "}
              — 15,000+ innovators across 20+ countries.
            </p>
            <p>
              Collaborated with{" "}
              <a href="https://aerdf.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                AERDF (Bill & Melinda Gates Foundation)
              </a>.
            </p>
          </div>

          <div className="flex items-center justify-center gap-6">
            <a
              href="https://www.linkedin.com/in/inioluwa-karunwi/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors"
            >
              <Linkedin className="w-5 h-5" />
              <span>LinkedIn</span>
            </a>
            <span className="text-muted-foreground">•</span>
            <a
              href="https://medium.com/@ini-karunwi"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors"
            >
              <BookOpen className="w-5 h-5" />
              <span>Medium</span>
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Hero;
