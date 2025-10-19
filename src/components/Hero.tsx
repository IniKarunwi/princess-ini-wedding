import { motion } from "framer-motion";
import { Linkedin, BookOpen } from "lucide-react";
import headshot from "@/assets/headshot.jpeg";

const Hero = () => {
  return (
    <section className="min-h-screen flex items-center justify-center px-6 pt-24 pb-16">
      <div className="max-w-4xl mx-auto text-center">
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
