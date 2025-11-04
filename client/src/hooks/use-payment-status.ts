import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface PaymentStatus {
    hasPaid: boolean;
    paymentDate: string | null;
}

export function usePaymentStatus() {
    return useQuery<PaymentStatus>({
        queryKey: ["/api/payment/status"],
        queryFn: async () => {
            const res = await apiRequest("GET", "/api/payment/status");
            return res.json();
        },
        staleTime: 0, // Always refetch to get latest payment status
        gcTime: 0, // Don't cache payment status
        retry: false,
        refetchOnWindowFocus: true, // Refetch when window gains focus
    });
}
