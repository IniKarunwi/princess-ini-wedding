import { motion } from "framer-motion";

const StatsBar = () => {
  const stats = [
    { number: "5+", label: "years of experience" },
    { number: "$3M+", label: "ARR contributed" },
    { number: "60+", label: "projects built" },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="w-full border-t border-b border-border/30 py-6 md:py-10"
      style={{ backgroundColor: '#0B0F0C' }}
    >
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 md:gap-12">
          {stats.map((stat, index) => (
            <div key={index} className="flex items-center gap-8 md:gap-12">
              <div className="text-center">
                <div className="text-4xl md:text-5xl font-bold mb-2" style={{ color: '#9FFF60' }}>
                  {stat.number}
                </div>
                <div className="text-sm md:text-base text-muted-foreground">
                  / {stat.label}
                </div>
              </div>
              {index < stats.length - 1 && (
                <div className="hidden md:block text-2xl" style={{ color: '#9FFF60' }}>
                  ✦
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  );
};

export default StatsBar;
