# DynamoDB OneTable Migration CLI

[![npm](https://img.shields.io/npm/v/onetable-migrate-cli.svg)](https://www.npmjs.com/package/onetable-migrate-cli)
[![npm](https://img.shields.io/npm/l/onetable-migrate-cli.svg)](https://www.npmjs.com/package/onetable-migrate-cli)

![OneTable](https://www.sensedeep.com/images/ring.png)

Theh DynamoDB OneTable Migration CLI is a command line tool for orchestrating DynamoDB migrations when using [DynamoDB OneTable](https://www.npmjs.com/package/dynamodb-onetable).

## OneTable Migration CLI Features


## Installation

    npm i onetable-cli -g

## Quick Tour

To get started, create a directory for your migrations in your project.

```
mkdir ./migrations
```

Then create a `migrate.json` with your DynamoDB OneTable configuration. We use JSON5 so you can use Javascript object literal syntax.

```
{
    onetable: {
        name: 'your-dynamo-table',
        schema: 'schema.js'
    }
}
```

Set the `name` property to the name of your DynamoDB table. Set the `schema` property to point to your OneTable schema.

Your configuration should match your OneTable configuration with respect to the OneTable `crypto`, `delimiter`, `nulls` and `typeField` settings.

Generate a stub migration

Migrations are Javascript files that export the methods `up` and `down` to apply the migration and a `description` property.

```
migrate generate
```

This will create a `0.0.1.js` migration that contains the following. Edit the `up` and `down` methods and description to suit.
The `db` property is the OneTable `Table` instance. This `migrate` property is an instance of the CLI Migrate class.

```
export default {
    description: 'Purpose of this migration',
    async up(db, migrate) {
        // await db.create('Model', {})
    },
    async down(db, migrate) {
        // await db.remove('Model', {})
    }
}
```

Apply the next migration

```
migrate up
```

Reverse the last migration

```
migrate down
```

Migrate to a specific version (up or down)
```
migrate 0.1.3
```

Apply all outstanding migrations

```
migrate all
```

Show the last migration

```
migrate status
```

Show applied migrations

```
migrate list
```

Show outstanding migrations not yet applied

```
migrate outstanding
```

Reset the database to the latest migration. This will erase the database and apply the `latest.js` migration. The purpose of the `latest` migration is to have one migration that can quickly create a new database with the latest schema without having to apply all historical migrations.

```
migrate reset
```

Generate a specific version migration

```
migrate --bump 2.4.3 generate
```

Do a dry run for a migration and not execute

```
migrate --dry up
```

Other options include
```
--dir directory                     # Change to directory to execute
--endpoint http://host:port         # Database endpoint
--profile prod|stage|...            # Select configuration profile
--schema schema.js                  # Database schema module
--verbose
```


### Accessing AWS

You can configure access to your AWS account several ways:

* via command line options
* via the migrate.json
* via environment variables

Via command line option:

```
migrate --aws-access-key key --aws-secret-key secret --aws-region us-east-1
```

Via migrate.json
```
{
    onetable: {
        aws: {
            accessKeyId: 'your-key',
            secretAccessKey: 'your-access',
            region: 'us-east-1'
        }
    }
}
```

Or via environment variables:

```
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_DEFAULT_REGION=us-east-1
```

You can also use:
```
export AWS_PROFILE=aws-profile-name
export AWS_REGION=us-east-1
```

To access a local DynamoDB database, set the migrate.json `aws.endpoint` property to point to the listening endpoint.

```
{
    aws: {
        endpoint: 'http://localhost:8000'
    }
}
```


### References

- [OneTable NPM](https://www.npmjs.com/package/dynamodb-onetable)
- [OneTable GitHub](https://github.com/sensedeep/dynamodb-onetable)
- [OneTable Post](https://www.sensedeep.com/blog/posts/2020/dynamodb-onetable.html)
- [DynamoDB Book](https://www.dynamodbbook.com/)
- [Alex DeBrie Best Practices Video](https://www.youtube.com/watch?v=8Ww1YW3AChE)
- [DocumentClient SDK Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html)
- [DynamoDB Guide](https://www.dynamodbguide.com/)
- [DynamoDB Toolbox](https://github.com/jeremydaly/dynamodb-toolbox)
- [Best Practices for DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)

### Participate

All feedback, contributions and bug reports are very welcome.

* [issues](https://github.com/sensedeep/onetable-cli/issues)

### Contact

You can contact me (Michael O'Brien) on Twitter at: [@SenseDeepCloud](https://twitter.com/SenseDeepCloud), or [email](mob-pub-18@sensedeep.com) and ready my [Blog](https://www.sensedeep.com/blog).

### SenseDeep

Please try our Serverless trouble shooter [SenseDeep](https://www.sensedeep.com/).
