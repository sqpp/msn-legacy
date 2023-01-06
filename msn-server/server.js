const express = require("express");
const app = express();
const rawBody = require("raw-body");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const { Pool } = require("pg");
const crypto = require("crypto");
const cors = require("cors");
app.use(cors());
app.use(bodyParser.json());
// Replace with your own secret key
const SECRET_KEY = "your_secret_key";
const connectionString = "postgres://marcell:football@localhost:5432/msnserver";

// Connection pool to the database
const pool = new Pool({
  connectionString: connectionString,
});

// Middleware function to verify JWT and attach user to request object
const verifyJWT = (req, res, next) => {
  const token = req.headers["x-access-token"];
  if (!token) {
    return res.status(401).send("No token provided");
  }

  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) {
      console.log(err); // Log the error
      console.log(decoded); // Log the decoded payload
      return res.status(500).send("Invalid token");
    }
    req.user = decoded;
    next();
  });
};

// API endpoint to login a user
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  // Look up the user in the database
  pool.query(
    "SELECT id, password FROM users WHERE email = $1",
    [email],
    (err, result) => {
      if (err) {
        return res.status(500).send("Error logging in");
      }
      if (!result.rows.length) {
        return res.status(401).send("Email not found");
      }
      const userId = result.rows[0].id;
      const hashedPassword = result.rows[0].password;

      // Check if the password is correct
      bcrypt.compare(password, hashedPassword, (err, result) => {
        if (err) {
          return res.status(500).send("Error logging in");
        }
        if (!result) {
          return res.status(401).send("Incorrect password");
        }

        // Generate a JWT for the user
        const token = jwt.sign({ id: userId }, SECRET_KEY, {
          expiresIn: 86400, // expires in 24 hours
        });

        res.status(200).send({ token });
      });
    }
  );
});

// API endpoint to retrieve a user's friend list
app.get("/friends", verifyJWT, (req, res) => {
  const userId = req.user.id; // Use the user ID from the JWT
  const requestedUserId = req.query.userId; // Get the user ID from the query string
  if (userId != requestedUserId) {
    return res.status(401).send("Unauthorized");
  }

  pool.query(
    "SELECT friends FROM users WHERE id = $1",
    [requestedUserId],
    (err, result) => {
      if (err) {
        return res.status(500).send("Error getting friend list");
      }
      if (!result.rows.length) {
        return res.status(404).send("User not found");
      }
      const friendList = result.rows[0].friends;
      res.status(200).send(friendList);
    }
  );
});

app.post("/sendSoundFile", verifyJWT, (req, res) => {
  userId = req.user.id;
  rawBody(
    req,
    {
      length: req.headers["content-length"],
      encoding: null,
    },
    (err, body) => {
      if (err) {
        // handle error
        return;
      }
      const ArrayBuffer = body;

      fs.writeFile("pager.m4a", Buffer.from(ArrayBuffer), "binary", (err) => {
        if (err) {
          console.error(err);
          return;
        }
        console.log("File saved!");
      });

      pool.query(
        "INSERT INTO messages (sender, message, recipient, messagetype, sound) VALUES ($1, $2, $3, $4, $5)",
        [userId, "sound", 2, 2, Buffer.from(ArrayBuffer)],
        (err, result) => {
          if (err) {
            return err + result;
          }
          res.status(200).send("Stored sound data...");
        }
      );

      // do something with it
    }
  );
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server listening on port 3000");
});

app.post("/sendMessage", verifyJWT, (req, res) => {
  const { recipientId, message } = req.body;
  const userId = req.user.id;
  // const messageID = result.rows[0].id;
  const recipientPublicKey = `-----BEGIN RSA PUBLIC KEY-----
MIICCgKCAgEAryOCl1vKED/jrehD574DEJ5INE6VgOgUlsIvp2l/BaxePVfHAr6V
EWZilwcYSdqYMR9F6q1u2+vm2/isyAzVVi/GhNGpILPk3hKfRu70Q7KlQMhkMLgW
1YD4UupiTTarmVR6qI/b6wP3QRr2tkZ1t5T8a7+SU0RxVDHkw+b/GW9To9swTvhC
ACAcC5Dyz7ecrN0oZ2EgeH2Ak99lmOiaCpcqM1LqJ90dIkUiUQhL8I/GkbJA5knX
idKc01BXnfq6YYj4u0xM0VDdgjQzDxGhoc4pYJ77WOwCshG8TqPkCD7CW0BhRWcP
UxEP1pivu5mmDML3UDyq6jKFBNFMrdzLZFzMP4mAHoZ+A0ttP8mgGdxgWoLetwdb
4pEbc4jBmELPHiWKNrfEUgtwz1SOinJ+qOqtQamx0mZ0Bt1BYq/9Hc/n+SKH/SYW
cn83wnJ49dqamm1rQnNXab/82ubNCC+Ff6wCrl+p7hqvwJqVTwIi13tLHhAtZTx4
IXRqsJkxydJGOJmjY8EbWK3AvgrDh2dzCU0rEtg+BZa/NcyQOIkp1qAuHSSDBH09
0AT5pmhotH3yYIR1unutBaGpgJYyIPo08ZDlphbBVAxSefO5dXORgB3nW46gRT3d
Z7+B3tWzSGCW2dmkF3OZIgJi7Ov7rkH2CgRDENH8aNDo6ioFwl0BlpcCAwEAAQ==
-----END RSA PUBLIC KEY-----`;

  const encryptedMessage = crypto
    .publicEncrypt(recipientPublicKey, Buffer.from(message, "utf8"))
    .toString("hex");

  pool.query(
    "INSERT INTO messages (sender, recipient, message) VALUES ($1, $2, $3) RETURNING id",
    [userId, recipientId, encryptedMessage],
    (err, result) => {
      if (err) {
        return res.status(500).send("Error sending message" + err);
      }
      res.status(200).send("Message sent");
    }
  );
});

app.get("/getMessage", verifyJWT, (req, res) => {
  const userId = req.user.id; // Use the user ID from the JWT
  //const messageId = req.query.messageId; // Get the user ID from the query string

  pool.query(
    "SELECT message FROM messages WHERE recipient = $1",
    [userId],
    (err, result) => {
      if (err) {
        return res.status(500).send("Error getting messages");
      }
      if (!result.rows.length) {
        return res.status(404).send("No message for you yet");
      }
      const encryptedMessage = result.rows[0].message;

      const recipientPrivateKey = `-----BEGIN RSA PRIVATE KEY-----
MIIJKAIBAAKCAgEAryOCl1vKED/jrehD574DEJ5INE6VgOgUlsIvp2l/BaxePVfH
Ar6VEWZilwcYSdqYMR9F6q1u2+vm2/isyAzVVi/GhNGpILPk3hKfRu70Q7KlQMhk
MLgW1YD4UupiTTarmVR6qI/b6wP3QRr2tkZ1t5T8a7+SU0RxVDHkw+b/GW9To9sw
TvhCACAcC5Dyz7ecrN0oZ2EgeH2Ak99lmOiaCpcqM1LqJ90dIkUiUQhL8I/GkbJA
5knXidKc01BXnfq6YYj4u0xM0VDdgjQzDxGhoc4pYJ77WOwCshG8TqPkCD7CW0Bh
RWcPUxEP1pivu5mmDML3UDyq6jKFBNFMrdzLZFzMP4mAHoZ+A0ttP8mgGdxgWoLe
twdb4pEbc4jBmELPHiWKNrfEUgtwz1SOinJ+qOqtQamx0mZ0Bt1BYq/9Hc/n+SKH
/SYWcn83wnJ49dqamm1rQnNXab/82ubNCC+Ff6wCrl+p7hqvwJqVTwIi13tLHhAt
ZTx4IXRqsJkxydJGOJmjY8EbWK3AvgrDh2dzCU0rEtg+BZa/NcyQOIkp1qAuHSSD
BH090AT5pmhotH3yYIR1unutBaGpgJYyIPo08ZDlphbBVAxSefO5dXORgB3nW46g
RT3dZ7+B3tWzSGCW2dmkF3OZIgJi7Ov7rkH2CgRDENH8aNDo6ioFwl0BlpcCAwEA
AQKCAgAHNeI5ArhBeK081Nytgab/pqdDXAmPWpQKbD6TrmYNNj5VA973enWJrK+a
Fy/ao+DIg53tyQEmQG1AmNmIN5sK5tb4qJHFfRKK9V+lsc3QVwkIWe0Mt8Tc5RKU
MKkmaP33R0FGMlIJYsrpsnH+KXghkZqI1xoaSoLom/tBTip/ghQCoXy41kNlXO0P
/teNp2S7Fd8wI7wMqeIYHxuViDIGBe42BGUL33BvykKHl9yvL+7VbcN6l7IDhG5y
IWh8t7y3qkYknpdlC2bAkbnua2Po/6NizSN8/Y5+L/kS5cV2yhqssMGwc/XvY2Wb
CK3nfoPAb8BzMbmPAHsgf9DKhwC/9Jb5/Hzo/wM6nlnKm157mEMohuxq7+13JfMA
+kbgKmoIjxuLNww8wqgvzkDD+GdVmgBlLIUAcRJJZdHG/s7ImvezpkuEzdkg2d1T
nJgBKEN1hol5DsiqfLzzxAf9IDMG6jjC07M6G30Y5W7zBRYNOdOYyUc6ztviZIiX
2EDBoNyPEmL51+1/1lbZQgrmlnkSNGa1IHt9uSjfAB5s2+/QQ7wwQrdgGZdijtax
Y/Bt3KqbSFYcTGm6wCY/qLRKjrcq2k85kPD560bfMc9JIlM7C5lYhrQItdFWRXxf
LqRhP0bzHIDj12wIpf8B4MOIItLVM3F2k6YjKb0KXJ25b+lY9QKCAQEA9MqSEEjv
q8T/YJbr1GIk3NW3fo9XQ1fsZTCkUbwHkXG22QQRmSUkOr4GikTkc6A7EPXEx+O4
MMyWURoSudCIeiYxMD44eNekpCXbzZ+Na+hP6bjkLHBWK2M2EC98wncn7JrtVcmo
9f3WR/vf4jj6WIW4cxMGp4QtkwF/CP1eH075AbqMgdgQ8Yn7Cc+3QWUgXGLJ//Sl
hF/5r20gu+7Dx232vwEgPo1bRfwFYRkvVJ5TK9OWRtONS6OHxzCHQ8Oj47Jmha6H
04rSIwUqO+uCDg989evRLqdX2YNccYgLMSVY27a756P8Ld8ppHSsYA0gQDa0RK8D
gpFs8uVnVB8TLQKCAQEAtyh53NEkVIKvOuRn3g0lJFiz7eBY0pKnHRX4egEssbm5
OsWWrm5+E8hztH2Gs3VZj9Z3DhjW2qzBfDaKz2/caEbWitaHLQ3X5dZyD4u1q5kO
sYYI7K7RqhB+31YBsOFT2Y84HZ8jUHJPSX1iyXjFEFmGO3yPsHMdSYrO50tYZVIu
QGD/1Tv/LwgimtjnBsrYVt1slJxX7fH7ZC1Tgncg/rDf9SxcDIPxidmyC/4d6G8U
7RkPTJUcH/lO0jSKpFzRn8iBUWvW3yeY0qq/ezsnpqX3i4rniqD3e9uwQ5qG7FhW
/xjj5/BlqktihjgwIk3cwcmIdGBPcrl1T0fiMW87UwKCAQEA5oi/9kY6MPJd74Ey
p9mmDbPYE4C7Fdj/8GxW1ALYvcjyAn8qc6fe7tN3JVCsNZh5CAftQrLbDFogVlDP
wd76KM8/E8gFNwkfLNfaoVPZw/4NBHfzq0ZAYKwWhjeyrxG4r8NYMKqyTLi5zSEQ
P+SZIDUO+JC6e5inswJ9uOGkeqfNKiudl8r8af0gRqUwWI38ZAVFZ5/nITuh0exc
H6FFD9QnxMoyq7ZEdyxZhJBLWs2gVm314M3rC4j+nkC9orvk5NNmag9sK3VZYVHD
7Jpm6Qb9EDz9y4od2eM0dFdC8w3RGVqGrChrnmfEt/SJQgwai175dpW8IIMEr9wL
69U4IQKCAQBUFFOk56la1kckrNd1muky/zlR+Mwtlj763iwbrdBboduDPFNIrdZY
tItRDtK4LSW5HwW2RfbTmbyUjeE5CqvOfr5cK9EQAKvciY4AzuzN4kxZeCM+q536
COqFEdFi5n18gP+MsZIfiuoU3Wds/3DPaZlyU2MO6DlIml0S1oa0tH4g9aZbt9gU
OhLQrMOZXaLkdW8z5XWD+LKjsR8F5DQUVxPoU73JzQQjePkAAl6uZdfgY8GfMVAg
6WyimJYQj793Ly8WNoAEHwRLqTCPnH8+RDAYMeLKw8v4YshOsHBBrOf64O02eyfg
fgyzerW1+bJej2qBqfiuvK46f9A5S0ubAoIBAAreMQuzUcxoOBKsDAELfxJlrEg9
90JUk1Td2XaHth+/ztn+dSyNr+l5ZxE3B3uUi8MlLTtoZBIJx4JqS64S5uz6lFKu
DWYsIWnAmRsLVGRpnQSv3BEK6/Fyd6cu2Oytiuj2oq4ftPdjJhV/kzKiWRyyjwdP
sLeGclbW2mbHEk1q3CaJcbRIRhMj4oQbpwtIoRdMdKXn8xywo7p5k1qU7vAiefHt
cxkZeLU5LrNNzg/W+HLje/j3W+CzwBpADrD/FDeA73cTAF7fLiY6ciTs8CNR8jbU
dmqm7WU6FayN5FDnf1eOenTBWveZ0TP6b853xodutlo9wzegWKDxhHgloL8=
-----END RSA PRIVATE KEY-----`;
      const decryptedMessage = crypto
        .privateDecrypt(
          recipientPrivateKey,
          Buffer.from(encryptedMessage, "hex")
        )
        .toString("utf8");

      console.log(decryptedMessage); // Outputs: 'Hello, recipient!'

      res.status(200).send({ decryptedMessage });
    }
  );
});

// API endpoint to register a new user
app.post("/register", (req, res) => {
  const { email, password } = req.body;

  // Hash the password before storing it in the database
  bcrypt.hash(password, 10, (err, hash) => {
    if (err) {
      return res.status(500).send("Error hashing password");
    }

    crypto.generateKeyPair(
      "rsa",
      {
        modulusLength: 4096,
        publicKeyEncoding: {
          type: "pkcs1",
          format: "pem",
        },
        privateKeyEncoding: {
          type: "pkcs1",
          format: "pem",
        },
      },
      (err, publicKey, privateKey) => {
        // handle errors
        if (err) {
          console.error(err);
          return;
        }
        // do something with the public and private keys

        const encPublic = publicKey;
        const encPrivate = privateKey;

        // Store the new user in the database
        pool.query(
          "INSERT INTO users (email, password, public_key) VALUES ($1, $2, $3) RETURNING id",
          [email, hash, encPublic],
          (err, result) => {
            if (err) {
              return res.status(500).send("Error creating user");
            }
            const userId = result.rows[0].id;

            // Generate a JWT for the new user
            const token = jwt.sign({ id: userId }, SECRET_KEY, {
              expiresIn: 86400, // expires in 24 hours
            });

            res.status(200).send({ auth: true, token, encPrivate });
          }
        );
      }
    );
  });
});

// Protected API endpoint
app.get("/protected", verifyJWT, (req, res) => {
  res.status(200).send("Access granted");
});
