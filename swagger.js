import swaggerAutogen from 'swagger-autogen';

const doc = {
  info: {
    title: 'My API',
    description: 'Description',
  },
  host: 'localhost:3000',
  schemes: ['http'],
};

const outputFile = './swagger-output.json';
const routes = ['./src/index.ts']; // Check this path matches your file structure

// Initialize the generator
swaggerAutogen()(outputFile, routes, doc);