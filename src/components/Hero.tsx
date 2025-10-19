import { motion } from "framer-motion";
import { Linkedin, BookOpen, Mail } from "lucide-react";
import headshot from "@/assets/ini-profile.jpg";
import { Button } from "@/components/ui/button";

const Hero = () => {
  return (
    <section 
      className="min-h-screen flex items-center justify-center px-6 pt-16 pb-12 relative overflow-hidden"
      style={{ backgroundColor: '#0B0F0C' }}
    >
      {/* Faint radial gradient glow */}
      <div 
        className="absolute top-1/2 right-1/2 w-[1000px] h-[1000px] rounded-full pointer-events-none -z-10"
        style={{
          background: 'radial-gradient(circle, rgba(159,255,96,0.05) 0%, transparent 70%)',
          filter: 'blur(80px)',
          transform: 'translate(50%, -50%)'
        }}
      />
      
      {/* Vertical gradient behind text */}
      <div 
        className="absolute inset-0 pointer-events-none -z-10"
        style={{
          background: 'linear-gradient(180deg, rgba(11,15,12,0.95), rgba(18,22,18,0.8))'
        }}
      />

      <div className="max-w-6xl mx-auto relative z-10 grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center">
        {/* Profile Photo - Left Side */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="flex justify-center md:justify-end"
        >
          <motion.div
            animate={{ 
              boxShadow: [
                '0 0 20px rgba(159, 255, 96, 0.35)',
                '0 0 30px rgba(159, 255, 96, 0.5)',
                '0 0 20px rgba(159, 255, 96, 0.35)'
              ]
            }}
            transition={{ 
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="rounded-full"
          >
            <img 
              src={headshot} 
              alt="Ini Karunwi profile photo" 
              className="w-64 h-64 md:w-80 md:h-80 lg:w-96 lg:h-96 rounded-full object-cover border-2 border-primary/30"
            />
          </motion.div>
        </motion.div>

        {/* Text Content - Right Side */}
        <div className="flex flex-col gap-6 text-center md:text-left">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-bold leading-tight"
            style={{ 
              fontSize: 'clamp(36px, 5vw, 54px)',
              lineHeight: '1.1',
              color: '#FFFFFF'
            }}
          >
            Hi, I'm Ini Karunwi
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg md:text-xl font-medium tracking-wide"
            style={{ color: '#B3B3B3' }}
          >
            Product & Project Manager • No-Code Developer
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, type: "spring" }}
            className="flex flex-wrap items-center justify-center md:justify-start gap-3"
          >
            <Button
              variant="outline"
              size="lg"
              asChild
              className="border-muted-foreground/30 hover:border-primary hover:bg-primary/10 transition-all duration-300"
            >
              <a
                href="https://www.linkedin.com/in/inioluwa-karunwi/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                <Linkedin className="w-4 h-4" />
                <span>LinkedIn</span>
              </a>
            </Button>
            <Button
              variant="outline"
              size="lg"
              asChild
              className="border-muted-foreground/30 hover:border-primary hover:bg-primary/10 transition-all duration-300"
            >
              <a
                href="https://medium.com/@ini-karunwi"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                <BookOpen className="w-4 h-4" />
                <span>Medium</span>
              </a>
            </Button>
            <Button
              variant="outline"
              size="lg"
              asChild
              className="border-muted-foreground/30 hover:border-primary hover:bg-primary/10 transition-all duration-300"
            >
              <a
                href="mailto:joel.karunwini@gmail.com"
                className="flex items-center gap-2"
              >
                <Mail className="w-4 h-4" />
                <span>Email Me</span>
              </a>
            </Button>
          </motion.div>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="text-xl md:text-2xl font-semibold leading-relaxed"
            style={{ color: '#EAEAEA', lineHeight: '1.5' }}
          >
            Experienced Product & Project Manager (5+ years). Helped scale{" "}
            <a 
              href="https://www.toptal.com/no-code" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline transition-all"
            >
              WeLoveNoCode
            </a>
            {" "}from $500k → $3M ARR. Founding member of{" "}
            <a 
              href="https://www.proptechbuzz.com/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline transition-all"
            >
              ProptechBuzz.com
            </a>
            {" "}— connecting 15,000+ innovators across 20+ countries.
          </motion.p>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="text-sm leading-relaxed mt-2"
            style={{ color: '#777777' }}
          >
            Collaborated with{" "}
            <a 
              href="https://aerdf.org/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-all"
            >
              AERDF
            </a>
            {" "}(Bill & Melinda Gates Foundation) on global education innovation initiatives.
          </motion.p>
        </div>
      </div>
    </section>
  );
};

export default Hero;
