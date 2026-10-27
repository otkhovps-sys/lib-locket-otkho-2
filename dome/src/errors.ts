export class LocketError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = new.target.name;
    }
}

export class AuthenticationError extends LocketError {}
export class StorageUploadError extends LocketError {}
export class LocketAPIError extends LocketError {
    constructor(message: string, public readonly statusCode?: number, public readonly responseData?: unknown) {
        super(message);
    }
}
