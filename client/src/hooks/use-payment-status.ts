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
        staleTime: 1000 * 60 * 5, // 5 minutes - payment status doesn't change often
        retry: false,
    });
}
