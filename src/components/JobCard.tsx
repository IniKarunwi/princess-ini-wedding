import { motion } from "framer-motion";
import { ReactNode } from "react";

interface JobCardProps {
  title: string;
  role?: string;
  children: ReactNode;
  delay?: number;
}

const JobCard = ({ title, role, children, delay = 0 }: JobCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ scale: 1.02, rotateX: 2 }}
      className="bg-card border border-border rounded-2xl p-6 hover:border-primary/50 transition-all duration-300"
    >
      <h3 className="text-2xl font-bold mb-2">{title}</h3>
      {role && <p className="text-primary font-medium mb-4">{role}</p>}
      <div className="text-muted-foreground space-y-3">
        {children}
      </div>
    </motion.div>
  );
};

export default JobCard;
