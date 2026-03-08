import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const generateSyllabusSummary = async (blockName: string) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Resume brevemente los puntos clave del bloque "${blockName}" del temario de la oposición TAI (Técnicos Auxiliares de Informática de la AGE). Devuelve solo el texto en formato markdown.`,
  });
  return response.text;
};
