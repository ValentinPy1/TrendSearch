import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = 'https://mpxmmnkkqsdmolonhsxa.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1weG1tbW5ra3FzZG1vbG9uaHN4YSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzM1MzQ0NzQwLCJleHAiOjIwNTA5MjA3NDB9.8bE*VLZN3hFeJ2'; // Replace with your actual anon key

console.log("[Database] Initializing Supabase client...");

const supabase = createClient(supabaseUrl, supabaseKey);

// Create a Drizzle-compatible interface
export const db = {
    select: () => ({
        from: (table: any) => ({
            where: (condition: any) => ({
                then: async (callback: any) => {
                    const { data, error } = await supabase
                        .from(table._.name)
                        .select('*')
                        .eq(condition.column.name, condition.value);

                    if (error) throw error;
                    return callback(data);
                }
            })
        })
    }),

    insert: (table: any) => ({
        values: (values: any) => ({
            returning: async () => {
                const { data, error } = await supabase
                    .from(table._.name)
                    .insert(values)
                    .select();

                if (error) throw error;
                return data;
            }
        })
    })
};

export default supabase;
