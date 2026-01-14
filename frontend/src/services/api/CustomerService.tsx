export const CustomerService = {
  async getCustomersMedium() {
    const res = await fetch(
      'https://www.primefaces.org/cdn/primereact/data/customers-medium.json'
    );
    return res.json();
  }
};
